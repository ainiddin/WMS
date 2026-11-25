package kz.keyfive.staff.ui.admin

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Link
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kz.keyfive.staff.data.Invitation
import kz.keyfive.staff.data.InvitationCreated
import kz.keyfive.staff.data.Session
import kz.keyfive.staff.data.auditDetailsText
import kz.keyfive.staff.data.auditRangeError
import kz.keyfive.staff.ui.Badge
import kz.keyfive.staff.ui.Blue
import kz.keyfive.staff.ui.ChipRow
import kz.keyfive.staff.ui.Confirm
import kz.keyfive.staff.ui.Empty
import kz.keyfive.staff.ui.ErrorBox
import kz.keyfive.staff.ui.Green
import kz.keyfive.staff.ui.Hint
import kz.keyfive.staff.ui.LoadedList
import kz.keyfive.staff.ui.Orange
import kz.keyfive.staff.ui.Picker
import kz.keyfive.staff.ui.Red
import kz.keyfive.staff.ui.Section
import kz.keyfive.staff.ui.StatTile
import kz.keyfive.staff.ui.TileRow
import kz.keyfive.staff.ui.dateTime
import kz.keyfive.staff.ui.load
import kz.keyfive.staff.ui.manager.NewLink
import kz.keyfive.staff.ui.manager.invitationItems
import kz.keyfive.staff.ui.money
import kz.keyfive.staff.ui.rememberAction

// ---------------- Invitations (all teams) ----------------
/**
 * Managers invite their staff by one-time links. The Admin sees every link and can revoke it, and makes a link
 * only for the very first Manager of a company that has none.
 */
@Composable
fun AdminInvitationsScreen(session: Session) {
    var status by remember { mutableStateOf<String?>(null) }
    val invitations = load(status) { session.api.allInvitations(status) }
    val noManager = load { session.api.employees("MANAGER").none { it.isActive } }
    val action = rememberAction()
    var created by remember { mutableStateOf<InvitationCreated?>(null) }
    var revoking by remember { mutableStateOf<Invitation?>(null) }

    LoadedList(invitations, header = {
        item { Hint("Staff join only by a one-time link from a Manager: a Worker into his team, a Manager with a team of his own.") }
        if (noManager.data == true || created != null) {
            item {
                Section("No Manager yet") {
                    Hint("The company has no active Manager, so nobody can invite staff. Make a link for the first Manager.")
                    Button(onClick = {
                        action.run(after = invitations.reload) { created = session.api.inviteFirstManager(); "Invitation link created" }
                    }, enabled = !action.busy) {
                        Icon(Icons.Default.Link, null)
                        Text("  Invite the first Manager")
                    }
                    created?.let { NewLink(session.server, it) }
                }
            }
        }
        item {
            ChipRow(listOf(null, "PENDING", "ACCEPTED", "EXPIRED", "REVOKED"), status, { it ?: "All" }) { status = it }
        }
    }) { list ->
        invitationItems(list, action.busy, showInviter = true) { revoking = it }
    }
    revoking?.let { inv ->
        Confirm("Revoke this invitation link?", "The link stops working at once.", "Revoke", action.busy,
            onConfirm = { action.run(after = { revoking = null; invitations.reload() }) { session.api.adminRevokeInvitation(inv.id); "Invitation revoked" } },
            onDismiss = { revoking = null })
    }
}

// ---------------- Payments ----------------
private val paymentStatus = mapOf(
    "SUCCEEDED" to ("Paid" to Green), "PENDING" to ("Open" to Blue),
    "FAILED" to ("Cancelled" to Orange), "EXPIRED" to ("Expired" to Color.Gray),
)

/** Money customers put in by card. Read only: there is no withdrawal for anybody. */
@Composable
fun PaymentsScreen(session: Session) {
    val data = load { session.api.payments() }

    LoadedList(data) { summary ->
        item { Hint("Top-ups by card through ${summary.gateway}. Read only: nobody can withdraw.") }
        item {
            TileRow(
                { StatTile("Received in total", money(summary.total), it, color = Green) },
                { StatTile("Received today", money(summary.today), it) },
            )
        }
        if (summary.payments.isEmpty()) item { Empty("No payments yet", "Customers' card top-ups appear here.") }
        items(summary.payments, key = { it.code }) { p ->
            val (label, color) = paymentStatus[p.status] ?: (p.status to Color.Gray)
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(p.customerName, fontWeight = FontWeight.SemiBold)
                            Hint("${p.code} · ${p.accountCode}")
                        }
                        Text(money(p.amount), fontWeight = FontWeight.SemiBold)
                    }
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Badge(label, color)
                        Hint(dateTime(p.createdAt) + (p.cardLast4?.let { " · ${p.cardBrand} •• $it" } ?: ""))
                    }
                    p.failureReason?.let { Hint(it) }
                }
            }
        }
    }
}

// ---------------- Audit log ----------------
val auditActionLabel = mapOf(
    "USER_APPROVED" to "Account approved",
    "USER_REJECTED" to "Account rejected",
    "USER_BLOCKED" to "Account blocked",
    "USER_UNBLOCKED" to "Account unblocked",
    "ROLE_CHANGED" to "Role changed",
    "TEAM_CHANGED" to "Team changed",
    "LOGIN_TIMER_CLEARED" to "Login timer cleared",
    "DEVICE_APPROVED" to "Phone approved",
    "DEVICE_REVOKED" to "Phone blocked",
    "TWO_FACTOR_CODE_SENT" to "Admin code sent",
    "TWO_FACTOR_FAILED" to "Wrong admin code",
    "TWO_FACTOR_PASSED" to "Admin signed in",
    "PASSWORD_CHANGED" to "Password changed",
    "INVITE_SENT" to "Invitation sent",
    "INVITE_RESENT" to "Invitation sent again",
    "INVITE_REVOKED" to "Invitation revoked",
    "INVITE_ACCEPTED" to "Joined by invitation",
    "INVITE_CODE_FAILED" to "Wrong invitation code",
)
private val auditDanger = setOf("TWO_FACTOR_FAILED", "INVITE_CODE_FAILED", "USER_BLOCKED", "DEVICE_REVOKED")
private const val AUDIT_PAGE = 50

/** Who did what to whom, when, from which IP. Read-only: nobody can change or delete a row. */
@Composable
fun AuditScreen(session: Session) {
    var action by remember { mutableStateOf<String?>(null) }
    var from by remember { mutableStateOf("") }
    var to by remember { mutableStateOf("") }
    var page by remember { mutableIntStateOf(0) }
    val rangeError = auditRangeError(from, to)
    val rows = load(action, from, to, page, rangeError) {
        if (rangeError != null) emptyList()
        else session.api.audit(action, from.ifBlank { null }, to.ifBlank { null }, AUDIT_PAGE, page * AUDIT_PAGE)
    }

    LoadedList(rows, header = {
        item { Hint("Every admin action and Admin sign in. Rows cannot be changed or deleted.") }
        item {
            Picker("Action", listOf<String?>(null) + auditActionLabel.keys, action,
                { it?.let { a -> auditActionLabel[a] } ?: "All actions" }) { action = it; page = 0 }
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(from, { from = it; page = 0 }, label = { Text("From") }, placeholder = { Text("YYYY-MM-DD") },
                    singleLine = true, modifier = Modifier.weight(1f))
                OutlinedTextField(to, { to = it; page = 0 }, label = { Text("To") }, placeholder = { Text("YYYY-MM-DD") },
                    singleLine = true, modifier = Modifier.weight(1f), isError = rangeError != null)
            }
        }
        rangeError?.let { item { ErrorBox(it) } }
    }) { list ->
        if (rangeError == null && list.isEmpty()) item { Empty("Nothing logged for these filters") }
        items(list, key = { it.id }) { r ->
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Badge(auditActionLabel[r.action] ?: r.action, if (r.action in auditDanger) Red else Color.Gray)
                        Text("  " + dateTime(r.createdAt), modifier = Modifier.weight(1f))
                    }
                    Text("${r.actorEmail ?: "system"} → ${r.targetEmail ?: "—"}")
                    Hint("IP ${r.ip ?: "—"}")
                    if (r.details.isNotEmpty()) Hint(auditDetailsText(r.details))
                }
            }
        }
        item {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.End, modifier = Modifier.fillMaxWidth()) {
                Hint("Page ${page + 1}")
                TextButton(onClick = { page-- }, enabled = page > 0) { Text("Newer") }
                TextButton(onClick = { page++ }, enabled = list.size >= AUDIT_PAGE) { Text("Older") }
            }
        }
    }
}
