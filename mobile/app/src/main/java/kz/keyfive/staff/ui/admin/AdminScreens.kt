package kz.keyfive.staff.ui.admin

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
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
import androidx.compose.ui.unit.dp
import kz.keyfive.staff.data.AdminUser
import kz.keyfive.staff.data.ApproveRequest
import kz.keyfive.staff.data.Employee
import kz.keyfive.staff.data.Session
import kz.keyfive.staff.data.StaffDevice
import kz.keyfive.staff.data.TeamChangeRequest
import kz.keyfive.staff.data.User
import kz.keyfive.staff.ui.Badge
import kz.keyfive.staff.ui.ChipRow
import kz.keyfive.staff.ui.Confirm
import kz.keyfive.staff.ui.Empty
import kz.keyfive.staff.ui.Green
import kz.keyfive.staff.ui.Hint
import kz.keyfive.staff.ui.LoadedList
import kz.keyfive.staff.ui.Orange
import kz.keyfive.staff.ui.Picker
import kz.keyfive.staff.ui.Red
import kz.keyfive.staff.ui.Section
import kz.keyfive.staff.ui.dateTime
import kz.keyfive.staff.ui.load
import kz.keyfive.staff.ui.rememberAction
import kz.keyfive.staff.ui.roleLabel
import kz.keyfive.staff.ui.statusColor

// ---------------- Staff phones ----------------
/**
 * Every phone a staff member signs in from needs approval here. A request the person did not make means
 * someone else knows their password: block the phone and ask them to change the password.
 */
@Composable
fun DevicesScreen(session: Session) {
    var status by remember { mutableStateOf<String?>("PENDING") }
    val devices = load(status) { session.api.devices(status) }
    val action = rememberAction()
    var revoking by remember { mutableStateOf<StaffDevice?>(null) }

    LoadedList(devices, header = {
        item {
            Section {
                Hint("Staff can work only on phones approved here. Approve a phone only after the employee " +
                    "confirms it is theirs (ask in person or by phone). An unexpected request means the password leaked.")
            }
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
                            Hint("${roleLabel[d.userRole]} · ${d.userEmail}")
                        }
                        Badge(if (d.current) "this phone" else d.status.lowercase(),
                            if (d.current) Green else statusColor(if (d.status == "REVOKED") "BLOCKED" else d.status))
                    }
                    Text(d.deviceName)
                    Hint("Requested ${dateTime(d.createdAt)}" + (d.lastSeenAt?.let { " · last sign in ${dateTime(it)}" } ?: ""))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        if (d.status != "APPROVED") {
                            Button(onClick = { action.run(after = devices.reload) { session.api.approveDevice(d.id); "Phone approved" } },
                                enabled = !action.busy, colors = ButtonDefaults.buttonColors(containerColor = Green)) { Text("Approve") }
                        }
                        if (d.status != "REVOKED" && !d.current) {
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
            onConfirm = { action.run(after = { revoking = null; devices.reload() }) { session.api.revokeDevice(d.id); "Phone blocked" } },
            onDismiss = { revoking = null })
    }
}

// ---------------- Staff requests ----------------
@Composable
fun ApprovalsScreen(session: Session) {
    val users = load { session.api.users(status = "PENDING") }
    val action = rememberAction()
    var approving by remember { mutableStateOf<AdminUser?>(null) }
    var rejecting by remember { mutableStateOf<AdminUser?>(null) }

    LoadedList(users, header = { item { Hint("Staff who signed up and cannot sign in until you approve them.") } }) { list ->
        if (list.isEmpty()) item { Empty("No pending requests", "New staff sign-ups will appear here.") }
        items(list, key = { it.id }) { u ->
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Row {
                        Text(u.fullName, Modifier.weight(1f), fontWeight = FontWeight.SemiBold)
                        Badge(roleLabel[u.requestedRole] ?: "—", Orange)
                    }
                    Hint(u.email + (u.phone?.let { " · $it" } ?: ""))
                    Hint("Signed up ${dateTime(u.createdAt)}")
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(onClick = { approving = u }, colors = ButtonDefaults.buttonColors(containerColor = Green)) { Text("Approve") }
                        TextButton(onClick = { rejecting = u }) { Text("Reject", color = Red) }
                    }
                }
            }
        }
    }
    approving?.let { RoleDialog(session, it, approve = true, onClose = { approving = null }, onDone = { approving = null; users.reload() }) }
    rejecting?.let { u ->
        Confirm("Reject ${u.fullName}?", "The account will not be able to sign in.", "Reject", action.busy,
            onConfirm = { action.run(after = { rejecting = null; users.reload() }) { "${session.api.rejectUser(u.id).fullName} rejected" } },
            onDismiss = { rejecting = null })
    }
}

/** Approve a request (Worker / Manager) or change the role / team of an active employee. */
@Composable
private fun RoleDialog(session: Session, user: AdminUser, approve: Boolean, onClose: () -> Unit, onDone: () -> Unit) {
    val managers = load { session.api.employees("MANAGER").filter { it.isActive && it.id != user.employee?.id } }
    val action = rememberAction()
    val roles = if (approve) listOf("WORKER", "MANAGER") else listOf("WORKER", "MANAGER", "ADMIN")
    var role by remember {
        mutableStateOf(if (approve) (if (user.requestedRole == "MANAGER") "MANAGER" else "WORKER") else user.role)
    }
    var manager by remember { mutableStateOf<Employee?>(null) }
    val currentManager = managers.data?.find { it.id == user.employee?.managerId }
    val chosen = manager ?: currentManager

    AlertDialog(
        onDismissRequest = onClose,
        title = { Text(if (approve) "Approve ${user.fullName}" else "Role and team · ${user.fullName}") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                if (approve) Hint("${user.email} asked to join as ${roleLabel[user.requestedRole] ?: "—"}. You can change the role.")
                ChipRow(roles, role, { roleLabel.getValue(it) }) { role = it }
                if (role == "WORKER") {
                    Picker("Team (Manager)", managers.data.orEmpty(), chosen, { "${it.teamName} — ${it.fullName}" }) { manager = it }
                    Hint(if (managers.data?.isEmpty() == true) "Approve a Manager first" else "A Worker always belongs to one Manager's team")
                }
                if (user.role == "MANAGER" && role != "MANAGER") Hint("A Manager with Workers must have them moved to another team first.")
            }
        },
        confirmButton = {
            Button(
                enabled = !action.busy && (role != "WORKER" || chosen != null),
                onClick = {
                    val managerId = if (role == "WORKER") chosen?.id else null
                    action.run(after = onDone) {
                        when {
                            approve -> session.api.approveUser(user.id, ApproveRequest(role, managerId))
                                .let { "${it.fullName} approved as ${roleLabel[it.role]} (${it.employee?.code})" }
                            user.role == "WORKER" && role == "WORKER" && user.employee != null -> {
                                session.api.changeTeam(user.employee.id, TeamChangeRequest(managerId!!))
                                "${user.fullName} moved to another team"
                            }
                            else -> session.api.changeRole(user.id, ApproveRequest(role, managerId))
                                .let { "${it.fullName} is now ${roleLabel[it.role]}" }
                        }
                    }
                },
            ) { Text(if (approve) "Approve" else "Save") }
        },
        dismissButton = { TextButton(onClick = onClose) { Text("Cancel") } },
    )
}

// ---------------- Users ----------------
@Composable
fun UsersScreen(session: Session, me: User) {
    var role by remember { mutableStateOf<String?>(null) }
    var status by remember { mutableStateOf<String?>(null) }
    var search by remember { mutableStateOf("") }
    val users = load(role, status, search) { session.api.users(status, role, search.trim().ifEmpty { null }) }
    val action = rememberAction()
    var approving by remember { mutableStateOf<AdminUser?>(null) }
    var editing by remember { mutableStateOf<AdminUser?>(null) }
    var blocking by remember { mutableStateOf<AdminUser?>(null) }

    LoadedList(users, header = {
        item {
            OutlinedTextField(search, { search = it }, label = { Text("Search by name or email") }, singleLine = true,
                modifier = Modifier.fillMaxWidth())
        }
        item { ChipRow(listOf(null, "ADMIN", "MANAGER", "WORKER", "CUSTOMER"), role, { roleLabel[it] ?: "All roles" }) { role = it } }
        item { ChipRow(listOf(null, "ACTIVE", "PENDING", "BLOCKED", "REJECTED"), status, { it ?: "All statuses" }) { status = it } }
    }) { list ->
        if (list.isEmpty()) item { Empty("No users match") }
        items(list, key = { it.id }) { u ->
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(u.fullName, fontWeight = FontWeight.SemiBold)
                            Hint(u.email + (u.employee?.let { " · ${it.code}" } ?: ""))
                        }
                        Badge(u.status.lowercase(), statusColor(u.status))
                    }
                    Hint("${roleLabel[u.role]}" + (u.employee?.takeIf { it.role != "ADMIN" }?.let { " · ${it.teamName}" } ?: "") +
                        " · signed up ${dateTime(u.createdAt)}")
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        if (u.status == "PENDING") TextButton(onClick = { approving = u }) { Text("Approve", color = Green) }
                        if (u.status == "ACTIVE" && u.employee != null) {
                            TextButton(onClick = { editing = u }) { Text(if (u.role == "WORKER") "Role / team" else "Role") }
                        }
                        if ((u.status == "ACTIVE" || u.status == "BLOCKED") && u.id != me.id) {
                            TextButton(onClick = { blocking = u }) {
                                Text(if (u.status == "BLOCKED") "Unblock" else "Block", color = if (u.status == "BLOCKED") Green else Red)
                            }
                        }
                    }
                }
            }
        }
    }
    approving?.let { RoleDialog(session, it, approve = true, onClose = { approving = null }, onDone = { approving = null; users.reload() }) }
    editing?.let { RoleDialog(session, it, approve = false, onClose = { editing = null }, onDone = { editing = null; users.reload() }) }
    blocking?.let { u ->
        val unblock = u.status == "BLOCKED"
        Confirm(
            if (unblock) "Unblock ${u.fullName}?" else "Block ${u.fullName}?",
            if (unblock) "The user will be able to sign in again."
            else "The user is signed out at once and cannot sign in. Orders and movements stay in the history.",
            if (unblock) "Unblock" else "Block", action.busy,
            onConfirm = {
                action.run(after = { blocking = null; users.reload() }) {
                    if (unblock) session.api.unblockUser(u.id) else session.api.blockUser(u.id)
                    "${u.fullName} ${if (unblock) "unblocked" else "blocked"}"
                }
            },
            onDismiss = { blocking = null },
        )
    }
}
