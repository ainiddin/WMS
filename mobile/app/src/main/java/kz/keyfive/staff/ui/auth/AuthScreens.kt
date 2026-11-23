package kz.keyfive.staff.ui.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kz.keyfive.staff.BuildConfig
import kz.keyfive.staff.data.InviteAcceptRequest
import kz.keyfive.staff.data.LoginStep
import kz.keyfive.staff.data.Session
import kz.keyfive.staff.data.TwoFactorChallenge
import kz.keyfive.staff.data.acceptProblem
import kz.keyfive.staff.data.codeFieldLabel
import kz.keyfive.staff.data.codeSentHint
import kz.keyfive.staff.data.digitsOnly
import kz.keyfive.staff.data.formatWait
import kz.keyfive.staff.data.lockMessage
import kz.keyfive.staff.data.message
import kz.keyfive.staff.data.newPasswordProblem
import kz.keyfive.staff.data.retryAfterSeconds
import kz.keyfive.staff.data.secondsLeft
import kz.keyfive.staff.ui.Hint

@Composable
fun AuthScreens(session: Session) {
    var invited by rememberSaveable { mutableStateOf(false) }
    var email by rememberSaveable { mutableStateOf("") }
    Page {
        Text("KeyFive Staff", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.primary)
        Hint("Warehouse app for Workers, Managers and Admins")
        if (invited) {
            AcceptInvitation(session) { acceptedEmail ->
                email = acceptedEmail
                invited = false
            }
            TextButton(onClick = { invited = false }) { Text("I already have an account") }
        } else {
            Login(session, email) { invited = true }
        }
    }
}

@Composable
private fun Page(content: @Composable ColumnScope.() -> Unit) {
    Column(
        Modifier.fillMaxSize().safeDrawingPadding().imePadding().verticalScroll(rememberScrollState()).padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        content = content,
    )
}

@Composable
private fun ErrorCard(text: String) {
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer)) {
        Text(text, Modifier.padding(12.dp), color = MaterialTheme.colorScheme.onErrorContainer)
    }
}

/** Ticks once a second while `active`, so timers on screen move. Returns "now" in milliseconds. */
@Composable
private fun rememberNow(active: Boolean): Long {
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(active) {
        while (active) {
            now = System.currentTimeMillis()
            delay(250) // the shown second changes on time; the value is always read from the clock
        }
    }
    return now
}

/** A 429: when it ends (from Retry-After, received once) and the server's text. Counted down here, never polled. */
private class Lock {
    var until by mutableStateOf<Long?>(null)
    var text by mutableStateOf("")

    /** Takes a 429 with Retry-After and returns true; any other error returns false. */
    fun take(error: Throwable): Boolean {
        val seconds = retryAfterSeconds(error) ?: return false
        until = System.currentTimeMillis() + seconds * 1000L
        text = error.message()
        return true
    }
}

/** Shows the live "Try again in 8:59." while locked; returns true while it lasts. Clears itself at 0:00. */
@Composable
private fun LockBanner(lock: Lock): Boolean {
    val until = lock.until ?: return false
    val now = rememberNow(active = true)
    val left = secondsLeft(until, 0, now)
    LaunchedEffect(left) {
        if (left == 0) lock.until = null // over: the banner goes away and the buttons work again
    }
    if (left > 0) {
        Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.tertiaryContainer)) {
            Text(lockMessage(lock.text, left), Modifier.padding(12.dp), color = MaterialTheme.colorScheme.onTertiaryContainer)
        }
    }
    return left > 0
}

@Composable
private fun Login(session: Session, initialEmail: String, openInvitation: () -> Unit) {
    val scope = rememberCoroutineScope()
    var email by rememberSaveable { mutableStateOf(initialEmail) }
    var password by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    var showServer by rememberSaveable { mutableStateOf(false) }
    var server by rememberSaveable { mutableStateOf(session.server) }
    var challenge by remember { mutableStateOf<TwoFactorChallenge?>(null) }
    val lock = remember { Lock() }

    challenge?.let { c ->
        CodeStep(session, c, onChallenge = { challenge = it }, onRestart = { challenge = null })
        return
    }

    OutlinedTextField(email, { email = it }, label = { Text("Email") }, singleLine = true, modifier = Modifier.fillMaxWidth(),
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email))
    OutlinedTextField(password, { password = it }, label = { Text("Password") }, singleLine = true,
        visualTransformation = PasswordVisualTransformation(), modifier = Modifier.fillMaxWidth(),
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password))
    val locked = LockBanner(lock)
    error?.let { ErrorCard(it) }
    Button(
        onClick = {
            busy = true
            error = null
            scope.launch {
                try {
                    if (server != session.server) session.server = server
                    val step = session.login(email, password)
                    if (step is LoginStep.NeedsCode) {
                        password = "" // not kept longer than needed
                        challenge = step.challenge
                    }
                } catch (e: Exception) {
                    if (!lock.take(e)) error = e.message()
                } finally {
                    busy = false
                }
            }
        },
        enabled = !busy && !locked && email.isNotBlank() && password.isNotBlank(),
        modifier = Modifier.fillMaxWidth(),
    ) { Text(if (busy) "Signing in…" else "Sign in") }

    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text("This phone: ${session.deviceName}", style = MaterialTheme.typography.labelLarge)
            Hint("The first sign in from a new phone must be approved (a Worker's phone by his Manager). Your password " +
                "alone is not enough, so nobody can enter the warehouse system with it from another phone.")
        }
    }
    OutlinedButton(onClick = openInvitation, modifier = Modifier.fillMaxWidth()) { Text("I have an invitation") }

    TextButton(onClick = { showServer = !showServer }) { Text("Server") }
    if (showServer) {
        OutlinedTextField(server, { server = it }, label = { Text("Server address") }, singleLine = true,
            modifier = Modifier.fillMaxWidth(), supportingText = {
                Text(if (BuildConfig.DEBUG) "Emulator + local backend: http://10.0.2.2:8000" else "https:// only")
            })
    }
}

/** Admin, first sign in on this phone: the 6-digit code from the corporate mailbox. */
@Composable
private fun CodeStep(session: Session, challenge: TwoFactorChallenge, onChallenge: (TwoFactorChallenge) -> Unit, onRestart: () -> Unit) {
    val scope = rememberCoroutineScope()
    var code by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var info by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    var sentAt by remember { mutableLongStateOf(System.currentTimeMillis()) }
    val now = rememberNow(active = true)
    val resendIn = secondsLeft(sentAt, challenge.resendSeconds, now)
    var sending by remember { mutableStateOf(false) } // "Send again" is on its way
    val codeLeft = secondsLeft(sentAt, challenge.codeSeconds, now)
    val lock = remember { Lock() }

    fun call(block: suspend () -> Unit) {
        busy = true
        error = null
        scope.launch {
            try {
                block()
            } catch (e: Exception) {
                val message = e.message()
                code = ""
                when {
                    message.contains("new code was sent") -> {
                        sentAt = System.currentTimeMillis()
                        info = message
                    }
                    message.contains("Sign in again") -> onRestart()
                    lock.take(e) -> Unit
                    else -> error = message
                }
            } finally {
                busy = false
            }
        }
    }

    Text("Enter the code", style = MaterialTheme.typography.titleLarge)
    Hint(codeSentHint(challenge.sentVia, challenge.sentTo))
    val locked = LockBanner(lock)
    error?.let { ErrorCard(it) }
    info?.let { Hint(it) }
    OutlinedTextField(code, { code = digitsOnly(it) }, label = { Text(codeFieldLabel(challenge.sentVia)) }, singleLine = true,
        modifier = Modifier.fillMaxWidth(), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
        supportingText = { Text(if (codeLeft > 0) "Works for ${formatWait(codeLeft)} more" else "Expired: send a new one") })
    Button(onClick = { call { session.verifyCode(challenge.challengeToken, code) } },
        enabled = !busy && !locked && code.length == 6, modifier = Modifier.fillMaxWidth()) { Text("Sign in") }
    OutlinedButton(
        onClick = {
            call {
                sending = true
                try {
                    onChallenge(session.resendCode(challenge.challengeToken))
                    sentAt = System.currentTimeMillis()
                    info = "A new code was sent. The previous one no longer works."
                } finally {
                    sending = false
                }
            }
        },
        enabled = !busy && !locked && resendIn == 0,
        modifier = Modifier.fillMaxWidth(),
    ) { Text(if (sending) "Sending…" else if (resendIn > 0) "Send again in $resendIn s" else "Send again") }
    TextButton(onClick = onRestart) { Text("Use another account") }
}

/** Staff join only by invitation: email, the code from the invitation email and a new password. */
@Composable
private fun AcceptInvitation(session: Session, done: (String) -> Unit) {
    val scope = rememberCoroutineScope()
    var email by rememberSaveable { mutableStateOf("") }
    var code by rememberSaveable { mutableStateOf("") }
    var phone by rememberSaveable { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var repeat by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    var joined by rememberSaveable { mutableStateOf(false) }
    val problem = acceptProblem(email, code, password, repeat)
    val lock = remember { Lock() }

    if (joined) {
        Text("Your account is ready", style = MaterialTheme.typography.titleLarge)
        Hint("Sign in now on this phone. The phone then waits for approval: a Worker's phone is approved by his Manager.")
        Button(onClick = { done(email.trim()) }, modifier = Modifier.fillMaxWidth()) { Text("Go to sign in") }
        return
    }

    Text("Join by invitation", style = MaterialTheme.typography.titleLarge)
    Hint("Your Manager invited you by email. Enter that email, the 6-digit code from it and choose a password.")
    OutlinedTextField(email, { email = it }, label = { Text("Work email") }, singleLine = true,
        modifier = Modifier.fillMaxWidth(), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email))
    OutlinedTextField(code, { code = digitsOnly(it) }, label = { Text("6-digit invitation code") }, singleLine = true,
        modifier = Modifier.fillMaxWidth(), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number))
    OutlinedTextField(phone, { phone = it }, label = { Text("Phone (optional, +7 7XX XXX XX XX)") }, singleLine = true,
        modifier = Modifier.fillMaxWidth(), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone))
    OutlinedTextField(password, { password = it }, label = { Text("New password (8+ characters)") }, singleLine = true,
        visualTransformation = PasswordVisualTransformation(), modifier = Modifier.fillMaxWidth())
    OutlinedTextField(repeat, { repeat = it }, label = { Text("Repeat the password") }, singleLine = true,
        visualTransformation = PasswordVisualTransformation(), modifier = Modifier.fillMaxWidth())
    if (problem != null && (code.isNotEmpty() || password.isNotEmpty())) Hint(problem)
    val locked = LockBanner(lock)
    error?.let { ErrorCard(it) }
    Button(
        onClick = {
            busy = true
            error = null
            scope.launch {
                try {
                    session.api.acceptInvitation(InviteAcceptRequest(email.trim(), code, password, phone.trim().ifEmpty { null }))
                    password = ""
                    repeat = ""
                    joined = true
                } catch (e: Exception) {
                    if (!lock.take(e)) error = e.message()
                } finally {
                    busy = false
                }
            }
        },
        enabled = !busy && !locked && problem == null,
        modifier = Modifier.fillMaxWidth(),
    ) { Text("Create my account") }
}

/** Change the password. `forced`: an Admin whose password expired cannot do anything else until it is done. */
@Composable
fun ChangePasswordScreen(session: Session, forced: Boolean, onDone: () -> Unit = {}) {
    val scope = rememberCoroutineScope()
    var current by remember { mutableStateOf("") }
    var new by remember { mutableStateOf("") }
    var repeat by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    val problem = newPasswordProblem(current, new, repeat)

    Page {
        Text("Change password", style = MaterialTheme.typography.titleLarge)
        if (forced) Hint("Your password has expired. Admins change it every 180 days; the new one must differ from the old.")
        else Hint("Other phones and the website will be signed out.")
        OutlinedTextField(current, { current = it }, label = { Text("Current password") }, singleLine = true,
            visualTransformation = PasswordVisualTransformation(), modifier = Modifier.fillMaxWidth())
        OutlinedTextField(new, { new = it }, label = { Text("New password") }, singleLine = true,
            visualTransformation = PasswordVisualTransformation(), modifier = Modifier.fillMaxWidth())
        OutlinedTextField(repeat, { repeat = it }, label = { Text("Repeat the new password") }, singleLine = true,
            visualTransformation = PasswordVisualTransformation(), modifier = Modifier.fillMaxWidth())
        if (problem != null && new.isNotEmpty()) Hint(problem)
        error?.let { ErrorCard(it) }
        Button(
            onClick = {
                busy = true
                error = null
                scope.launch {
                    try {
                        session.changePassword(current, new)
                        current = ""
                        new = ""
                        repeat = ""
                        onDone()
                    } catch (e: Exception) {
                        error = e.message()
                    } finally {
                        busy = false
                    }
                }
            },
            enabled = !busy && current.isNotEmpty() && problem == null,
            modifier = Modifier.fillMaxWidth(),
        ) { Text("Change password") }
        if (forced) TextButton(onClick = { session.logout() }) { Text("Sign out") }
    }
}
