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
    item { ChipRow(PERIODS, period, { PERIOD_LABELS.getValue(it) }, onChange) }
    if (start != null) item { Hint("${date(start)} – ${date(end)}") }
}

private fun LazyListScope.timeline(points: List<TimelinePoint>) = item {
    Section("Points over time") {
        val max = points.maxOfOrNull { it.points }?.toFloat() ?: 0f
        if (points.all { it.points == 0 }) Hint("No activity in this period yet")
        else points.forEach { BarRow(date(it.date), it.points.toFloat(), max, "${it.points} pts", Green) }
    }
}

@Composable
private fun MetricTiles(m: Metrics) {
    TileRow(
        { StatTile("Points", num(m.points), it, color = Green) },
        if (m.role == "MANAGER") {
            { StatTile("Orders approved", num(m.ordersApproved), it, "${m.ordersRejected} rejected") }
        } else {
            { StatTile("Orders shipped", num(m.ordersShipped), it, "${num(m.unitsShipped)} units") }
        },
    )
    TileRow(
        { StatTile("Stock IN received", num(m.stockInCount), it, "${num(m.unitsIn)} units") },
        if (m.role == "MANAGER") {
            { StatTile("Avg time to approve", m.avgApprovalHours?.let { h -> "%.1f h".format(h) } ?: "—", it) }
        } else {
            { StatTile("Units shipped", num(m.unitsShipped), it) }
        },
    )
}

@Composable
private fun WorkerRow(m: Metrics) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text("${m.rank ?: ""}", Modifier.width(28.dp), fontWeight = FontWeight.Bold)
        Column(Modifier.weight(1f)) {
            Text(m.fullName)
            Hint("${roleLabel[m.role]} · shipped ${m.ordersShipped} · IN ${m.stockInCount}" +
                if (m.role == "MANAGER") " · approved ${m.ordersApproved}" else "")
        }
        Text("${m.points} pts", fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun TeamRow(t: TeamSummary, highlight: Boolean = false, onClick: (() -> Unit)? = null) {
    Card(Modifier.fillMaxWidth().let { if (onClick != null) it.clickable(onClick = onClick) else it }) {
        Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("${t.rank}", Modifier.width(28.dp), style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold,
                color = if (t.rank == 1) Green else MaterialTheme.colorScheme.onSurface)
            Column(Modifier.weight(1f)) {
                Text(t.teamName + if (highlight) " (yours)" else "", fontWeight = FontWeight.SemiBold)
                Hint("${t.managerName} · ${t.members} members · shipped ${t.ordersShipped} · IN ${t.stockInCount}")
            }
            Text("${num(t.points)} pts", fontWeight = FontWeight.SemiBold)
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
                    Text("Team place: ${team.rank}" + (d.rankInTeam?.let { " · your place in the team: $it of ${d.teamSize}" } ?: ""))
                    Hint("${num(team.points)} team points")
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
        d.team?.let { t ->
            item {
                TileRow(
                    { StatTile("Team place", "${t.rank}", it, "${t.members} members") },
                    { StatTile("Team points", num(t.points), it, color = Green) },
                )
            }
            item {
                TileRow(
                    { StatTile("Orders shipped", num(t.ordersShipped), it, "${num(t.unitsShipped)} units") },
                    { StatTile("Stock IN", num(t.stockInCount), it) },
                )
            }
        }
        item { Section("Manager") { WorkerRow(d.manager) } }
        item {
            Section("Workers ranking") {
                if (d.workers.isEmpty()) Hint("No workers in this team yet")
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
                { StatTile("Orders shipped", num(d.totals.ordersShipped), it, "${num(d.totals.unitsShipped)} units") },
                { StatTile("Orders approved", num(d.totals.ordersApproved), it) },
            )
        }
        item {
            TileRow(
                { StatTile("Stock IN", num(d.totals.stockInCount), it) },
                { StatTile("Total points", num(d.totals.points), it, color = Green) },
            )
        }
        item { Hint("Tap a team to see its workers") }
        if (d.teams.isEmpty()) item { Empty("No teams yet", "A team appears when a Manager is approved.") }
        items(d.teams, key = { it.managerId }) { t -> TeamRow(t) { openTeam(t.managerId) } }
        timeline(d.timeline)
    }
}

@Composable
fun LeaderboardScreen(session: Session) {
    var period by rememberSaveable { mutableStateOf("month") }
    val data = load(period) { session.api.leaderboard(period) }
    val me = session.user
    LoadedList(data, header = { periodPicker(period, data.data?.start, data.data?.end) { period = it } }) { d ->
        item { Hint("Points: ${d.pointsFormula}") }
        if (d.teams.isEmpty()) item { Empty("No teams yet") }
        items(d.teams, key = { it.managerId }) { t ->
            TeamRow(t, highlight = me?.employeeId == t.managerId || me?.managerId == t.managerId)
        }
    }
}
