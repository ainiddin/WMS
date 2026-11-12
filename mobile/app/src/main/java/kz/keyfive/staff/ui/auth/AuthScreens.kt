package kz.keyfive.staff.ui.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
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
import androidx.compose.runtime.getValue
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
import kotlinx.coroutines.launch
import kz.keyfive.staff.BuildConfig
import kz.keyfive.staff.data.SendCodeRequest
import kz.keyfive.staff.data.Session
import kz.keyfive.staff.data.StaffRegisterRequest
import kz.keyfive.staff.data.message
import kz.keyfive.staff.ui.ChipRow
import kz.keyfive.staff.ui.Hint

@Composable
fun AuthScreens(session: Session) {
    var signUp by rememberSaveable { mutableStateOf(false) }
    Column(
        Modifier.fillMaxSize().safeDrawingPadding().imePadding().verticalScroll(rememberScrollState()).padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text("KeyFive Staff", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.primary)
        Hint("Warehouse app for Workers, Managers and Admins")
        if (signUp) SignUp(session) { signUp = false } else Login(session) { signUp = true }
    }
}

@Composable
private fun Login(session: Session, openSignUp: () -> Unit) {
    val scope = rememberCoroutineScope()
    var email by rememberSaveable { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    var showServer by rememberSaveable { mutableStateOf(false) }
    var server by rememberSaveable { mutableStateOf(session.server) }

    OutlinedTextField(email, { email = it }, label = { Text("Email") }, singleLine = true, modifier = Modifier.fillMaxWidth(),
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email))
    OutlinedTextField(password, { password = it }, label = { Text("Password") }, singleLine = true,
        visualTransformation = PasswordVisualTransformation(), modifier = Modifier.fillMaxWidth(),
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password))
    error?.let {
        Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer)) {
            Text(it, Modifier.padding(12.dp), color = MaterialTheme.colorScheme.onErrorContainer)
        }
    }
    Button(
        onClick = {
            busy = true
            error = null
            scope.launch {
                try {
                    if (server != session.server) session.server = server
                    session.login(email, password)
                } catch (e: Exception) {
                    error = e.message()
                } finally {
                    busy = false
                }
            }
        },
        enabled = !busy && email.isNotBlank() && password.isNotBlank(),
        modifier = Modifier.fillMaxWidth(),
    ) { Text(if (busy) "Signing in…" else "Sign in") }

    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text("This phone: ${session.deviceName}", style = MaterialTheme.typography.labelLarge)
            Hint("The first sign in from a new phone must be approved by the Admin. Your password alone is not enough, " +
                "so nobody can enter the warehouse system with it from another phone.")
        }
    }
    OutlinedButton(onClick = openSignUp, modifier = Modifier.fillMaxWidth()) { Text("New employee? Sign up") }

    TextButton(onClick = { showServer = !showServer }) { Text("Server") }
    if (showServer) {
        OutlinedTextField(server, { server = it }, label = { Text("Server address") }, singleLine = true,
            modifier = Modifier.fillMaxWidth(), supportingText = {
                Text(if (BuildConfig.DEBUG) "Emulator + local backend: http://10.0.2.2:8000" else "https:// only")
            })
    }
}

@Composable
private fun SignUp(session: Session, back: () -> Unit) {
    val scope = rememberCoroutineScope()
    var email by rememberSaveable { mutableStateOf("") }
    var code by rememberSaveable { mutableStateOf("") }
    var fullName by rememberSaveable { mutableStateOf("") }
    var phone by rememberSaveable { mutableStateOf("") }
    var role by rememberSaveable { mutableStateOf("WORKER") }
    var password by remember { mutableStateOf("") }
    var codeSent by rememberSaveable { mutableStateOf(false) }
    var info by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    var done by rememberSaveable { mutableStateOf(false) }

    fun call(block: suspend () -> String) {
        busy = true
        error = null
        scope.launch {
            try {
                info = block()
            } catch (e: Exception) {
                error = e.message()
            } finally {
                busy = false
            }
        }
    }

    if (done) {
        Text("Request sent", style = MaterialTheme.typography.titleLarge)
        Hint("An Admin checks staff requests. When your account is approved, sign in on this phone; " +
            "the Admin then approves the phone too.")
        Button(onClick = back, modifier = Modifier.fillMaxWidth()) { Text("Back to sign in") }
        return
    }

    Text("Staff sign up", style = MaterialTheme.typography.titleLarge)
    OutlinedTextField(email, { email = it; codeSent = false }, label = { Text("Work email") }, singleLine = true,
        modifier = Modifier.fillMaxWidth(), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email))
    OutlinedButton(
        onClick = { call { session.api.sendCode(SendCodeRequest(email.trim())).detail.also { codeSent = true } } },
        enabled = !busy && email.contains('@'),
        modifier = Modifier.fillMaxWidth(),
    ) { Text(if (codeSent) "Send the code again" else "Send confirmation code") }

    if (codeSent) {
        OutlinedTextField(code, { code = it.filter(Char::isDigit).take(6) }, label = { Text("6-digit code from the email") },
            singleLine = true, modifier = Modifier.fillMaxWidth(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number))
        OutlinedTextField(fullName, { fullName = it }, label = { Text("Full name") }, singleLine = true,
            modifier = Modifier.fillMaxWidth())
        OutlinedTextField(phone, { phone = it }, label = { Text("Phone (+7 7XX XXX XX XX)") }, singleLine = true,
            modifier = Modifier.fillMaxWidth(), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone))
        OutlinedTextField(password, { password = it }, label = { Text("Password (8+ characters)") }, singleLine = true,
            visualTransformation = PasswordVisualTransformation(), modifier = Modifier.fillMaxWidth())
        Text("I want to work as", style = MaterialTheme.typography.labelLarge, modifier = Modifier.fillMaxWidth())
        ChipRow(listOf("WORKER", "MANAGER"), role, { if (it == "WORKER") "Worker" else "Manager" }) { role = it }
        Button(
            onClick = {
                call {
                    session.api.registerStaff(
                        StaffRegisterRequest(email.trim(), code, password, fullName.trim(), phone.trim().ifEmpty { null }, role)
                    ).detail.also { done = true }
                }
            },
            enabled = !busy && code.length == 6 && fullName.isNotBlank() && password.length >= 8,
            modifier = Modifier.fillMaxWidth(),
        ) { Text("Send request") }
    }
    info?.let { Hint(it) }
    error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
    TextButton(onClick = back) { Text("I already have an account") }
}
