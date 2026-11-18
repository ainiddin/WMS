package kz.keyfive.staff.ui.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.repeatOnLifecycle
import kotlinx.coroutines.delay
import kz.keyfive.staff.data.PendingWebLogin
import kz.keyfive.staff.data.Session
import kz.keyfive.staff.data.WEB_LOGIN_CHECK_MS
import kz.keyfive.staff.data.WebLoginDecision
import kz.keyfive.staff.data.answersWebLogins
import kz.keyfive.staff.data.describeBrowser
import kz.keyfive.staff.data.message
import kz.keyfive.staff.ui.Hint
import kz.keyfive.staff.ui.dateTime
import kz.keyfive.staff.ui.rememberAction

/**
 * "Is this you?" for website sign ins of this account (like Steam Guard). While the app is on screen it asks the
 * server every WEB_LOGIN_CHECK_MS; in the background it asks nothing. The person taps the number the browser shows;
 * a wrong number or "No" rejects that sign in.
 */
@Composable
fun WebLoginRequests(session: Session, role: String) {
    if (!answersWebLogins(role)) return
    var current by remember { mutableStateOf<PendingWebLogin?>(null) }
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    val action = rememberAction()

    LaunchedEffect(lifecycle) {
        lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
            while (true) {
                current = runCatching { session.api.pendingWebLogins().firstOrNull() }.getOrNull()
                delay(WEB_LOGIN_CHECK_MS)
            }
        }
    }

    val req = current ?: return
    AlertDialog(
        onDismissRequest = {}, // must be answered: Yes (a number) or No
        title = { Text("Website sign in: is this you?") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Someone is signing in to KeyFive on the website with your password.")
                Hint("${describeBrowser(req.userAgent)} · IP ${req.ip ?: "unknown"} · ${dateTime(req.createdAt)}")
                Text("If it is you, tap the number shown in the browser:", fontWeight = FontWeight.SemiBold)
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) {
                    req.choices.forEach { n ->
                        Button(
                            enabled = !action.busy,
                            onClick = {
                                action.run(after = { current = null }) {
                                    val r = session.api.approveWebLogin(req.id, WebLoginDecision(n))
                                    if (r.isSuccessful) "Signed in on the website"
                                    else "Wrong number: that sign in was rejected. If it was you, sign in again in the browser."
                                }
                            },
                        ) { Text("$n", fontSize = 22.sp) }
                    }
                }
            }
        },
        confirmButton = {},
        dismissButton = {
            TextButton(
                enabled = !action.busy,
                onClick = {
                    action.run(after = { current = null }) {
                        session.api.denyWebLogin(req.id)
                        "Rejected. Someone knows your password: change it now."
                    }
                },
            ) { Text("No, it was not me", color = MaterialTheme.colorScheme.error) }
        },
    )
}
