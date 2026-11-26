package kz.keyfive.staff.ui.performance

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kz.keyfive.staff.data.Metrics
import kz.keyfive.staff.data.Session
import kz.keyfive.staff.data.TeamSummary
import kz.keyfive.staff.data.TimelinePoint
import kz.keyfive.staff.ui.BarRow
import kz.keyfive.staff.ui.ChipRow
import kz.keyfive.staff.ui.Empty
import kz.keyfive.staff.ui.Green
import kz.keyfive.staff.i18n.t
import kz.keyfive.staff.ui.Hint
import kz.keyfive.staff.ui.LoadedList
import kz.keyfive.staff.ui.Section
import kz.keyfive.staff.ui.StatTile
import kz.keyfive.staff.ui.TileRow
import kz.keyfive.staff.ui.date
import kz.keyfive.staff.ui.load
import kz.keyfive.staff.ui.num
import kz.keyfive.staff.ui.roleLabel

private val PERIODS = listOf("week", "month", "quarter", "year")
private val PERIOD_LABELS = mapOf("week" to "This week", "month" to "This month", "quarter" to "This quarter", "year" to "This year")

private fun LazyListScope.periodPicker(period: String, start: String?, end: String?, onChange: (String) -> Unit) {
    item { ChipRow(PERIODS, period, { t(PERIOD_LABELS.getValue(it)) }, onChange) }
    if (start != null) item { Hint("${date(start)} – ${date(end)}") }
}

private fun LazyListScope.timeline(points: List<TimelinePoint>) = item {
    Section(t("Points over time")) {
        val max = points.maxOfOrNull { it.points }?.toFloat() ?: 0f
        if (points.all { it.points == 0 }) Hint(t("No activity in this period yet"))
        else points.forEach { BarRow(date(it.date), it.points.toFloat(), max, t("{0} pts", it.points), Green) }
    }
}

@Composable
private fun MetricTiles(m: Metrics) {
    TileRow(
        { StatTile(t("Points"), num(m.points), it, color = Green) },
        if (m.role == "MANAGER") {
            { StatTile(t("Orders approved"), num(m.ordersApproved), it, t("{0} rejected", m.ordersRejected)) }
        } else {
            { StatTile(t("Orders shipped"), num(m.ordersShipped), it, t("{0} units", num(m.unitsShipped))) }
        },
    )
    TileRow(
        { StatTile(t("Stock IN received"), num(m.stockInCount), it, t("{0} units", num(m.unitsIn))) },
        if (m.role == "MANAGER") {
            { StatTile(t("Avg time to approve"), m.avgApprovalHours?.let { h -> t("{0} h", "%.1f".format(h)) } ?: "—", it) }
        } else {
            { StatTile(t("Units shipped"), num(m.unitsShipped), it) }
        },
    )
}

@Composable
private fun WorkerRow(m: Metrics) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text("${m.rank ?: ""}", Modifier.width(28.dp), fontWeight = FontWeight.Bold)
        Column(Modifier.weight(1f)) {
            Text(m.fullName)
            Hint("${roleLabel[m.role]} · " + t("shipped {0}", m.ordersShipped) + " · IN ${m.stockInCount}" +
                if (m.role == "MANAGER") " · " + t("approved {0}", m.ordersApproved) else "")
        }
        Text(t("{0} pts", m.points), fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun TeamRow(team: TeamSummary, highlight: Boolean = false, onClick: (() -> Unit)? = null) {
    Card(Modifier.fillMaxWidth().let { if (onClick != null) it.clickable(onClick = onClick) else it }) {
        Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("${team.rank}", Modifier.width(28.dp), style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold,
                color = if (team.rank == 1) Green else MaterialTheme.colorScheme.onSurface)
            Column(Modifier.weight(1f)) {
                Text(team.teamName + if (highlight) " " + t("(yours)") else "", fontWeight = FontWeight.SemiBold)
                Hint("${team.managerName} · " + t("{0} members", team.members) + " · " + t("shipped {0}", team.ordersShipped) +
                    " · IN ${team.stockInCount}")
            }
            Text(t("{0} pts", num(team.points)), fontWeight = FontWeight.SemiBold)
        }
    }
}

@Composable
fun MyPerformanceScreen(session: Session) {
    var period by rememberSaveable { mutableStateOf("month") }
    val data = load(period) { session.api.myPerformance(period) }
    LoadedList(data, header = { periodPicker(period, data.data?.start, data.data?.end) { period = it } }) { d ->
        item { MetricTiles(d.me) }
        d.team?.let { team ->
            item {
                Section(team.teamName) {
                    Text(t("Team place: {0}", team.rank) + (d.rankInTeam?.let { " · " + t("your place in the team: {0} of {1}", it, d.teamSize) } ?: ""))
                    Hint(t("{0} team points", num(team.points)))
                }
            }
        }
        timeline(d.timeline)
    }
}

@Composable
fun TeamPerformanceScreen(session: Session, managerId: Int) {
    var period by rememberSaveable { mutableStateOf("month") }
    val data = load(period, managerId) { session.api.teamPerformance(managerId, period) }
    LoadedList(data, header = { periodPicker(period, data.data?.start, data.data?.end) { period = it } }) { d ->
        d.team?.let { team ->
            item {
                TileRow(
                    { StatTile(t("Team place"), "${team.rank}", it, t("{0} members", team.members)) },
                    { StatTile(t("Team points"), num(team.points), it, color = Green) },
                )
            }
            item {
                TileRow(
                    { StatTile(t("Orders shipped"), num(team.ordersShipped), it, t("{0} units", num(team.unitsShipped))) },
                    { StatTile(t("Stock IN"), num(team.stockInCount), it) },
                )
            }
        }
        item { Section(t("Manager")) { WorkerRow(d.manager) } }
        item {
            Section(t("Workers ranking")) {
                if (d.workers.isEmpty()) Hint(t("No workers in this team yet"))
                d.workers.forEach { WorkerRow(it) }
            }
        }
        timeline(d.timeline)
    }
}

@Composable
fun AdminPerformanceScreen(session: Session, openTeam: (Int) -> Unit) {
    var period by rememberSaveable { mutableStateOf("month") }
    val data = load(period) { session.api.allPerformance(period) }
    LoadedList(data, header = { periodPicker(period, data.data?.start, data.data?.end) { period = it } }) { d ->
        item {
            TileRow(
                { StatTile(t("Orders shipped"), num(d.totals.ordersShipped), it, t("{0} units", num(d.totals.unitsShipped))) },
                { StatTile(t("Orders approved"), num(d.totals.ordersApproved), it) },
            )
        }
        item {
            TileRow(
                { StatTile(t("Stock IN"), num(d.totals.stockInCount), it) },
                { StatTile(t("Total points"), num(d.totals.points), it, color = Green) },
            )
        }
        item { Hint(t("Tap a team to see its workers")) }
        if (d.teams.isEmpty()) item { Empty(t("No teams yet"), t("A team appears when a Manager is approved.")) }
        items(d.teams, key = { it.managerId }) { team -> TeamRow(team) { openTeam(team.managerId) } }
        timeline(d.timeline)
    }
}

@Composable
fun LeaderboardScreen(session: Session) {
    var period by rememberSaveable { mutableStateOf("month") }
    val data = load(period) { session.api.leaderboard(period) }
    val me = session.user
    LoadedList(data, header = { periodPicker(period, data.data?.start, data.data?.end) { period = it } }) { d ->
        item { Hint(t("Points: {0}", d.pointsFormula)) }
        if (d.teams.isEmpty()) item { Empty(t("No teams yet")) }
        items(d.teams, key = { it.managerId }) { team ->
            TeamRow(team, highlight = me?.employeeId == team.managerId || me?.managerId == team.managerId)
        }
    }
}
