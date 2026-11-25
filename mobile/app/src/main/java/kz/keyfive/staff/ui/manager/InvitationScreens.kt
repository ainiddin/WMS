package kz.keyfive.staff.ui.manager

import android.content.Intent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kz.keyfive.staff.data.Invitation
import kz.keyfive.staff.data.InvitationCreate
import kz.keyfive.staff.data.InvitationCreated
import kz.keyfive.staff.data.Session
import kz.keyfive.staff.data.canRevokeInvitation
import kz.keyfive.staff.data.invitationUrl
import kz.keyfive.staff.ui.Badge
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
import kz.keyfive.staff.ui.toast

// ---------------- Invitation links (the same as the website's Invitations page) ----------------
private val inviteColor = mapOf("PENDING" to Orange, "ACCEPTED" to Green, "EXPIRED" to Red, "REVOKED" to Color.Gray)

/** Invite a Worker into my team, or a Manager (who gets his own team), by a one-time link. Never above my rank. */
@Composable
fun InvitationsScreen(session: Session) {
    val invitations = load { session.api.myInvitations() }
    val action = rememberAction()
    var role by remember { mutableStateOf("WORKER") }
    var created by remember { mutableStateOf<InvitationCreated?>(null) }
    var revoking by remember { mutableStateOf<Invitation?>(null) }

    LoadedList(invitations, header = {
        item {
            Section {
                Hint("Make a link and send it to the person. They type their name, work email, phone and a password, " +
                    "get an employee id and sign in in the KeyFive Staff app; you approve their phone.")
                ChipRow(listOf("WORKER", "MANAGER"), role,
                    { if (it == "WORKER") "Worker (joins my team)" else "Manager (gets own team)" }) { role = it }
                Button(onClick = {
                    action.run(after = invitations.reload) {
                        created = session.api.invite(InvitationCreate(role))
                        "Invitation link created"
                    }
                }, enabled = !action.busy) {
                    Icon(Icons.Default.Link, null)
                    Text("  Create invitation link")
                }
                created?.let { NewLink(session.server, it) }
            }
        }
    }) { list ->
        invitationItems(list, action.busy, showInviter = false) { revoking = it }
    }
    revoking?.let { inv ->
        Confirm("Revoke this invitation link?", "The link stops working at once.", "Revoke", action.busy,
            onConfirm = { action.run(after = { revoking = null; invitations.reload() }) { session.api.revokeInvitation(inv.id); "Invitation revoked" } },
            onDismiss = { revoking = null })
    }
}

/** The link right after it was made: shown only now (the server keeps only its hash). */
@Composable
fun NewLink(server: String, created: InvitationCreated) {
    val context = LocalContext.current
    val clipboard = LocalClipboardManager.current
    val url = invitationUrl(server, created.link)
    Card(colors = CardDefaults.cardColors(containerColor = Green.copy(alpha = 0.10f))) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Link ready. Send it to the person (Telegram, WhatsApp…). It works once, until ${dateTime(created.expiresAt)}.",
                fontWeight = FontWeight.SemiBold)
            SelectionContainer { Text(url, style = MaterialTheme.typography.bodyMedium) }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = {
                    clipboard.setText(AnnotatedString(url))
                    context.toast("Copied")
                }) {
                    Icon(Icons.Default.ContentCopy, null)
                    Text("  Copy")
                }
                OutlinedButton(onClick = {
                    val send = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, url)
                    context.startActivity(Intent.createChooser(send, "Send the invitation link"))
                }) {
                    Icon(Icons.Default.Share, null)
                    Text("  Send")
                }
            }
            Hint("This is the only time the link is shown. If it gets lost, revoke it and make a new one.")
        }
    }
}

/** Links with their status and, once used, who joined with them. */
fun LazyListScope.invitationItems(
    list: List<Invitation>,
    busy: Boolean,
    showInviter: Boolean,
    onRevoke: (Invitation) -> Unit,
) {
    if (list.isEmpty()) item { Empty("No invitations yet", "Make a link and send it to the person.") }
    items(list, key = { it.id }) { inv -> InvitationCard(inv, busy, showInviter) { onRevoke(inv) } }
}

@Composable
private fun InvitationCard(inv: Invitation, busy: Boolean, showInviter: Boolean, onRevoke: () -> Unit) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(roleLabel[inv.role] ?: inv.role, fontWeight = FontWeight.SemiBold)
                    Hint("Made ${dateTime(inv.createdAt)}" + (inv.teamName?.let { " · $it" } ?: ""))
                }
                Badge(inv.status, inviteColor[inv.status] ?: Color.Gray)
            }
            if (showInviter) Hint("By ${inv.invitedByEmail}")
            when (inv.status) {
                "ACCEPTED" -> Text("${inv.joinedName ?: "—"} · ${inv.joinedEmployeeCode ?: ""}" +
                    (inv.joinedEmail?.let { "\n$it" } ?: ""))
                "PENDING" -> Hint("Valid until ${dateTime(inv.expiresAt)}")
            }
            if (canRevokeInvitation(inv.status)) {
                TextButton(onClick = onRevoke, enabled = !busy) { Text("Revoke", color = Red) }
            }
        }
    }
}
