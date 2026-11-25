package kz.keyfive.staff.ui.manager

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import kz.keyfive.staff.data.Session
import kz.keyfive.staff.data.StaffDevice
import kz.keyfive.staff.data.TeamMember
import kz.keyfive.staff.ui.Badge
import kz.keyfive.staff.ui.Blue
import kz.keyfive.staff.ui.ChipRow
import kz.keyfive.staff.ui.Confirm
import kz.keyfive.staff.ui.Empty
import kz.keyfive.staff.ui.Green
import kz.keyfive.staff.ui.Hint
import kz.keyfive.staff.ui.LoadedList
import kz.keyfive.staff.ui.Orange
import kz.keyfive.staff.ui.Red
import kz.keyfive.staff.ui.Section
import kz.keyfive.staff.ui.dateTime
import kz.keyfive.staff.ui.load
import kz.keyfive.staff.ui.rememberAction
import kz.keyfive.staff.ui.roleLabel
import kz.keyfive.staff.ui.statusColor

// ---------------- Team members and their phones (Manager) ----------------
@Composable
fun TeamMembersScreen(session: Session) {
    var tab by remember { mutableStateOf("members") }
    when (tab) {
        "members" -> MembersList(session) { tab = it }
        else -> TeamPhonesList(session) { tab = it }
    }
}

@Composable
private fun Tabs(selected: String, onSelect: (String) -> Unit) {
    ChipRow(listOf("members", "phones"), selected, { if (it == "members") "Members" else "Phones" }, onSelect)
}

@Composable
private fun MembersList(session: Session, onTab: (String) -> Unit) {
    val members = load { session.api.teamMembers() }
    val action = rememberAction()
    var blocking by remember { mutableStateOf<TeamMember?>(null) }

    LoadedList(members, header = {
        item { Tabs("members", onTab) }
        item { Hint("Only the Workers of your team. Blocking signs a person out at once; the history stays.") }
    }) { list ->
        if (list.isEmpty()) item { Empty("No Workers in your team yet", "Invite them with a link: Invitations on the website.") }
        items(list, key = { it.userId }) { m ->
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(m.fullName, fontWeight = FontWeight.SemiBold)
                            Hint("${m.code} · ${m.email}" + (m.phone?.let { " · $it" } ?: ""))
                        }
                        Badge(m.status.lowercase(), statusColor(m.status))
                    }
                    if (m.status == "ACTIVE" || m.status == "BLOCKED") {
                        TextButton(onClick = { blocking = m }, enabled = !action.busy) {
                            Text(if (m.status == "BLOCKED") "Unblock" else "Block", color = if (m.status == "BLOCKED") Green else Red)
                        }
                    }
                }
            }
        }
    }
    blocking?.let { m ->
        val unblock = m.status == "BLOCKED"
        Confirm(if (unblock) "Unblock ${m.fullName}?" else "Block ${m.fullName}?",
            if (unblock) "${m.fullName} will be able to sign in again." else "${m.fullName} is signed out at once and cannot sign in.",
            if (unblock) "Unblock" else "Block", action.busy,
            onConfirm = {
                action.run(after = { blocking = null; members.reload() }) {
                    if (unblock) session.api.unblockMember(m.userId) else session.api.blockMember(m.userId)
                    "${m.fullName} ${if (unblock) "unblocked" else "blocked"}"
                }
            },
            onDismiss = { blocking = null })
    }
}

@Composable
private fun TeamPhonesList(session: Session, onTab: (String) -> Unit) {
    var status by remember { mutableStateOf<String?>("PENDING") }
    val devices = load(status) { session.api.teamDevices(status) }
    val action = rememberAction()
    var revoking by remember { mutableStateOf<StaffDevice?>(null) }

    LoadedList(devices, header = {
        item { Tabs("phones", onTab) }
        item {
            Hint("Your Workers can work only on phones you approve. Approve a phone only after the person confirms " +
                "it is theirs. An unexpected request means their password leaked.")
        }
        item {
            ChipRow(listOf("PENDING", "APPROVED", "REVOKED", null), status,
                { mapOf("PENDING" to "Waiting", "APPROVED" to "Approved", "REVOKED" to "Blocked")[it] ?: "All" }) { status = it }
        }
    }) { list ->
        if (list.isEmpty()) item { Empty(if (status == "PENDING") "No phones waiting" else "No phones") }
        items(list, key = { it.id }) { d ->
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(d.userFullName, fontWeight = FontWeight.SemiBold)
                            Hint(d.userEmail)
                        }
                        Badge(d.status.lowercase(), statusColor(if (d.status == "REVOKED") "BLOCKED" else d.status))
                    }
                    Text(d.deviceName)
                    Hint("Requested ${dateTime(d.createdAt)}")
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        if (d.status != "APPROVED") {
                            Button(onClick = { action.run(after = devices.reload) { session.api.approveTeamDevice(d.id); "Phone approved" } },
                                enabled = !action.busy, colors = ButtonDefaults.buttonColors(containerColor = Green)) { Text("Approve") }
                        }
                        if (d.status != "REVOKED") {
                            OutlinedButton(onClick = { revoking = d }, enabled = !action.busy) { Text("Block", color = Red) }
                        }
                    }
                }
            }
        }
    }
    revoking?.let { d ->
        Confirm("Block this phone?", "${d.deviceName} of ${d.userFullName} is signed out at once and cannot sign in again.",
            "Block", action.busy,
            onConfirm = { action.run(after = { revoking = null; devices.reload() }) { session.api.revokeTeamDevice(d.id); "Phone blocked" } },
            onDismiss = { revoking = null })
    }
}
