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
import androidx.compose.material3.MaterialTheme
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
import kz.keyfive.staff.i18n.t
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
                Hint(t("Staff can work only on phones approved here. Approve a phone only after the employee " +
                    "confirms it is theirs (ask in person or by phone). An unexpected request means the password leaked."))
            }
        }
        item {
            ChipRow(listOf("PENDING", "APPROVED", "REVOKED", null), status,
                { mapOf("PENDING" to "Waiting", "APPROVED" to "Approved", "REVOKED" to "Blocked")[it]?.let { s -> t(s) } ?: t("All") }) { status = it }
        }
    }) { list ->
        if (list.isEmpty()) item { Empty(if (status == "PENDING") t("No phones waiting") else t("No phones")) }
        items(list, key = { it.id }) { d ->
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(d.userFullName, fontWeight = FontWeight.SemiBold)
                            Hint("${roleLabel[d.userRole]} · ${d.userEmail}")
                        }
                        Badge(if (d.current) t("this phone") else t(d.status.lowercase()),
                            if (d.current) Green else statusColor(if (d.status == "REVOKED") "BLOCKED" else d.status))
                    }
                    Text(d.deviceName)
                    Hint(t("Requested {0}", dateTime(d.createdAt)) + (d.lastSeenAt?.let { " · " + t("last sign in {0}", dateTime(it)) } ?: ""))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        if (d.status != "APPROVED") {
                            Button(onClick = { action.run(after = devices.reload) { session.api.approveDevice(d.id); t("Phone approved") } },
                                enabled = !action.busy, colors = ButtonDefaults.buttonColors(containerColor = Green)) { Text(t("Approve")) }
                        }
                        if (d.status != "REVOKED" && !d.current) {
                            OutlinedButton(onClick = { revoking = d }, enabled = !action.busy) { Text(t("Block"), color = Red) }
                        }
                    }
                }
            }
        }
    }
    revoking?.let { d ->
        Confirm(t("Block this phone?"), t("{0} of {1} is signed out at once and cannot sign in again.", d.deviceName, d.userFullName),
            t("Block"), action.busy,
            onConfirm = { action.run(after = { revoking = null; devices.reload() }) { session.api.revokeDevice(d.id); t("Phone blocked") } },
            onDismiss = { revoking = null })
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
        title = { Text(if (approve) t("Approve {0}", user.fullName) else t("Role and team · {0}", user.fullName)) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                if (approve) Hint(t("{0} asked to join as {1}. You can change the role.", user.email, roleLabel[user.requestedRole] ?: "—"))
                ChipRow(roles, role, { roleLabel.getValue(it) }) { role = it }
                if (role == "WORKER") {
                    Picker(t("Team (Manager)"), managers.data.orEmpty(), chosen, { "${it.teamName} — ${it.fullName}" }) { manager = it }
                    Hint(if (managers.data?.isEmpty() == true) t("Approve a Manager first") else t("A Worker always belongs to one Manager's team"))
                }
                if (user.role == "MANAGER" && role != "MANAGER") Hint(t("A Manager with Workers must have them moved to another team first."))
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
                                .let { t("{0} approved as {1} ({2})", it.fullName, roleLabel[it.role], it.employee?.code) }
                            user.role == "WORKER" && role == "WORKER" && user.employee != null -> {
                                session.api.changeTeam(user.employee.id, TeamChangeRequest(managerId!!))
                                t("{0} moved to another team", user.fullName)
                            }
                            else -> session.api.changeRole(user.id, ApproveRequest(role, managerId))
                                .let { t("{0} is now {1}", it.fullName, roleLabel[it.role]) }
                        }
                    }
                },
            ) { Text(if (approve) t("Approve") else t("Save")) }
        },
        dismissButton = { TextButton(onClick = onClose) { Text(t("Cancel")) } },
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
            OutlinedTextField(search, { search = it }, label = { Text(t("Search by name or email")) }, singleLine = true,
                modifier = Modifier.fillMaxWidth())
        }
        item { ChipRow(listOf(null, "ADMIN", "MANAGER", "WORKER", "CUSTOMER"), role, { roleLabel[it] ?: t("All roles") }) { role = it } }
        item { ChipRow(listOf(null, "ACTIVE", "PENDING", "BLOCKED", "REJECTED"), status, { it?.let { s -> t(s.lowercase()) } ?: t("All statuses") }) { status = it } }
    }) { list ->
        if (list.isEmpty()) item { Empty(t("No users match")) }
        items(list, key = { it.id }) { u ->
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(u.fullName, fontWeight = FontWeight.SemiBold)
                            Hint(u.email + (u.employee?.let { " · ${it.code}" } ?: ""))
                        }
                        Badge(t(u.status.lowercase()), statusColor(u.status))
                    }
                    Hint("${roleLabel[u.role]}" + (u.employee?.takeIf { it.role != "ADMIN" }?.let { " · ${it.teamName}" } ?: "") +
                        " · " + t("signed up {0}", dateTime(u.createdAt)))
                    if (u.loginFailures > 0) {
                        val locked = u.loginLockedSeconds > 0
                        Text(
                            if (locked) t("Login locked: {0} wrong passwords, {1} min left", u.loginFailures, (u.loginLockedSeconds + 59) / 60)
                            else t("{0} wrong password(s) in the last 15 min", u.loginFailures),
                            style = MaterialTheme.typography.bodySmall, color = if (locked) Red else Orange,
                        )
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        if (u.status == "PENDING") TextButton(onClick = { approving = u }) { Text(t("Approve"), color = Green) }
                        if (u.status == "ACTIVE" && u.employee != null) {
                            TextButton(onClick = { editing = u }) { Text(if (u.role == "WORKER") t("Role / team") else t("Role")) }
                        }
                        if ((u.status == "ACTIVE" || u.status == "BLOCKED") && u.id != me.id) {
                            TextButton(onClick = { blocking = u }) {
                                Text(if (u.status == "BLOCKED") t("Unblock") else t("Block"), color = if (u.status == "BLOCKED") Green else Red)
                            }
                        }
                        if (u.loginFailures > 0) {
                            TextButton(onClick = {
                                action.run(after = users.reload) { session.api.clearLoginTimer(u.id); t("Login timer of {0} cleared", u.fullName) }
                            }, enabled = !action.busy) { Text(t("Clear timer")) }
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
            if (unblock) t("Unblock {0}?", u.fullName) else t("Block {0}?", u.fullName),
            if (unblock) t("The user will be able to sign in again.")
            else t("The user is signed out at once and cannot sign in. Orders and movements stay in the history."),
            if (unblock) t("Unblock") else t("Block"), action.busy,
            onConfirm = {
                action.run(after = { blocking = null; users.reload() }) {
                    if (unblock) session.api.unblockUser(u.id) else session.api.blockUser(u.id)
                    if (unblock) t("{0} unblocked", u.fullName) else t("{0} blocked", u.fullName)
                }
            },
            onDismiss = { blocking = null },
        )
    }
}
