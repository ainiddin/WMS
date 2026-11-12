package kz.keyfive.staff.ui

import android.content.Context
import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.MenuAnchorType
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import kz.keyfive.staff.data.message
import java.text.NumberFormat
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

// ---------------- Theme ----------------
val Blue = Color(0xFF1B4D8C)
val Green = Color(0xFF2E7D4F)
val Orange = Color(0xFFE07B00)
val Red = Color(0xFFC62828)

@Composable
fun KeyFiveTheme(content: @Composable () -> Unit) {
    val colors = if (isSystemInDarkTheme()) {
        darkColorScheme(primary = Color(0xFF9CC2F5), secondary = Color(0xFF7FD3A2), error = Color(0xFFFF8A80))
    } else {
        lightColorScheme(primary = Blue, secondary = Green, error = Red, background = Color(0xFFF5F7FA))
    }
    MaterialTheme(colorScheme = colors, content = content)
}

// ---------------- Formatting ----------------
private val almaty = ZoneId.of("Asia/Almaty")
private val dateTime = DateTimeFormatter.ofPattern("dd.MM.yyyy HH:mm")
private val dateOnly = DateTimeFormatter.ofPattern("dd.MM.yyyy")
private val number = NumberFormat.getIntegerInstance(Locale("ru", "KZ"))

fun money(value: Double): String = number.format(Math.round(value)) + " ₸"
fun num(value: Int): String = number.format(value)

fun dateTime(iso: String?): String = iso?.let {
    runCatching { OffsetDateTime.parse(it).atZoneSameInstant(almaty).format(dateTime) }.getOrDefault(it)
} ?: "—"

fun date(iso: String?): String = iso?.let {
    runCatching { LocalDate.parse(it.take(10)).format(dateOnly) }.getOrDefault(it)
} ?: "—"

fun eta(min: Int?, max: Int?): String? = when {
    min == null || max == null -> null
    min == max -> "~$min days"
    else -> "$min–$max days"
}

val roleLabel = mapOf("ADMIN" to "Admin", "MANAGER" to "Manager", "WORKER" to "Worker", "CUSTOMER" to "Customer")

fun Context.toast(text: String) = Toast.makeText(this, text, Toast.LENGTH_LONG).show()

// ---------------- Loading data ----------------
/** Result of a request shown on a screen: data, error or loading, plus reload(). */
class Loaded<T>(val data: T?, val error: String?, val loading: Boolean, val reload: () -> Unit)

@Composable
fun <T> load(vararg keys: Any?, fetch: suspend () -> T): Loaded<T> {
    var version by remember { mutableIntStateOf(0) }
    var data by remember { mutableStateOf<T?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var loading by remember { mutableStateOf(true) }
    LaunchedEffect(version, *keys) {
        loading = true
        try {
            data = fetch()
            error = null
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            error = e.message()
        }
        loading = false
    }
    return Loaded(data, error, loading) { version++ }
}

/** Runs a server action; shows the error as a toast. Returns the busy flag and the launcher. */
class Action(private val scope: CoroutineScope, private val context: Context) {
    var busy by mutableStateOf(false)
        private set

    fun run(done: String? = null, after: () -> Unit = {}, block: suspend () -> Any?) {
        if (busy) return
        busy = true
        scope.launch {
            try {
                val result = block()
                context.toast(done ?: (result as? String) ?: "Done")
                after()
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                context.toast(e.message())
            } finally {
                busy = false
            }
        }
    }
}

@Composable
fun rememberAction(): Action {
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    return remember { Action(scope, context) }
}

/** Screen body: pull to refresh, spinner on first load, error with retry. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun <T> LoadedList(state: Loaded<T>, header: LazyListScope.() -> Unit = {}, content: LazyListScope.(T) -> Unit) {
    PullToRefreshBox(isRefreshing = state.loading && state.data != null, onRefresh = state.reload) {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            header()
            val data = state.data
            when {
                data != null -> content(data)
                state.error != null -> item { ErrorBox(state.error, state.reload) }
                else -> item {
                    Box(Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator()
                    }
                }
            }
            if (data != null && state.error != null) item { ErrorBox(state.error, state.reload) }
        }
    }
}

@Composable
fun ErrorBox(text: String, retry: (() -> Unit)? = null) {
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer)) {
        Column(Modifier.padding(16.dp)) {
            Text(text, color = MaterialTheme.colorScheme.onErrorContainer)
            if (retry != null) TextButton(onClick = retry) { Text("Try again") }
        }
    }
}

@Composable
fun Empty(title: String, text: String? = null) {
    Column(Modifier.fillMaxWidth().padding(vertical = 32.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Text(title, style = MaterialTheme.typography.titleMedium)
        if (text != null) Text(text, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
fun Section(title: String? = null, action: @Composable () -> Unit = {}, content: @Composable ColumnScope.() -> Unit) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            if (title != null) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(title, style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                    action()
                }
            }
            content()
        }
    }
}

@Composable
fun Hint(text: String) = Text(text, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)

@Composable
fun Badge(text: String, color: Color) {
    Text(
        text,
        color = color,
        style = MaterialTheme.typography.labelMedium,
        fontWeight = FontWeight.SemiBold,
        modifier = Modifier.clip(RoundedCornerShape(8.dp)).background(color.copy(alpha = 0.12f))
            .padding(horizontal = 8.dp, vertical = 2.dp),
    )
}

fun statusColor(status: String) = when (status) {
    "APPROVED", "ACTIVE" -> Blue
    "SHIPPED" -> Green
    "PENDING" -> Orange
    else -> Red
}

val orderStatusLabel = mapOf(
    "PENDING" to "Waiting for stock", "APPROVED" to "To ship", "SHIPPED" to "Shipped",
    "REJECTED" to "Rejected", "CANCELLED" to "Cancelled",
)

@Composable
fun StatTile(label: String, value: String, modifier: Modifier = Modifier, hint: String? = null, color: Color? = null) {
    Card(modifier) {
        Column(Modifier.padding(12.dp)) {
            Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(value, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold,
                color = color ?: MaterialTheme.colorScheme.onSurface, maxLines = 1, overflow = TextOverflow.Ellipsis)
            if (hint != null) Hint(hint)
        }
    }
}

@Composable
fun TileRow(vararg tiles: @Composable (Modifier) -> Unit) {
    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        tiles.forEach { it(Modifier.weight(1f)) }
    }
}

/** Horizontal bar: value of max, with a label on the left and text on the right. */
@Composable
fun BarRow(label: String, value: Float, max: Float, text: String, color: Color = MaterialTheme.colorScheme.primary) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(label, modifier = Modifier.width(110.dp), maxLines = 1, overflow = TextOverflow.Ellipsis,
            style = MaterialTheme.typography.bodySmall)
        LinearProgressIndicator(
            progress = { if (max <= 0f) 0f else (value / max).coerceIn(0f, 1f) },
            modifier = Modifier.weight(1f).height(8.dp).clip(RoundedCornerShape(4.dp)),
            color = color,
            trackColor = color.copy(alpha = 0.12f),
            drawStopIndicator = {},
        )
        Spacer(Modifier.width(8.dp))
        Text(text, style = MaterialTheme.typography.bodySmall, modifier = Modifier.width(96.dp), maxLines = 1)
    }
}

@Composable
fun <T> ChipRow(options: List<T>, selected: T, label: (T) -> String, onSelect: (T) -> Unit) {
    Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        options.forEach { option ->
            FilterChip(selected = option == selected, onClick = { onSelect(option) }, label = { Text(label(option)) })
        }
    }
}

/** Dropdown picker over a list. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun <T> Picker(
    label: String,
    options: List<T>,
    selected: T?,
    text: (T) -> String,
    modifier: Modifier = Modifier.fillMaxWidth(),
    onSelect: (T) -> Unit,
) {
    var open by remember { mutableStateOf(false) }
    ExposedDropdownMenuBox(expanded = open, onExpandedChange = { open = it }, modifier = modifier) {
        OutlinedTextField(
            value = selected?.let(text) ?: "",
            onValueChange = {},
            readOnly = true,
            label = { Text(label) },
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = open) },
            modifier = Modifier.fillMaxWidth().menuAnchor(MenuAnchorType.PrimaryNotEditable),
        )
        ExposedDropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            options.forEach { option ->
                DropdownMenuItem(text = { Text(text(option)) }, onClick = { onSelect(option); open = false })
            }
        }
    }
}

@Composable
fun Confirm(title: String, text: String, confirm: String, busy: Boolean, onConfirm: () -> Unit, onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = { Text(text) },
        confirmButton = { Button(onClick = onConfirm, enabled = !busy) { Text(confirm) } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

// ---------------- Barcode ----------------
/** Opens the Google Play services scanner (EAN-13 and other 1D/QR codes); calls onCode with the raw value. */
fun scanBarcode(context: Context, onCode: (String) -> Unit) {
    val options = GmsBarcodeScannerOptions.Builder()
        .setBarcodeFormats(Barcode.FORMAT_EAN_13, Barcode.FORMAT_EAN_8, Barcode.FORMAT_UPC_A, Barcode.FORMAT_CODE_128,
            Barcode.FORMAT_QR_CODE)
        .enableAutoZoom()
        .build()
    GmsBarcodeScanning.getClient(context, options).startScan()
        .addOnSuccessListener { barcode -> barcode.rawValue?.let(onCode) }
        .addOnFailureListener { context.toast("Scanner is not available: ${it.localizedMessage}. Type the code instead.") }
}

/** Text field for a barcode with a camera button. Enter or the camera submits the code. */
@Composable
fun BarcodeField(label: String = "Barcode", onSubmit: (String) -> Unit) {
    val context = LocalContext.current
    var code by remember { mutableStateOf("") }
    OutlinedTextField(
        value = code,
        onValueChange = { value -> code = value.filter { it.isDigit() }.take(14) },
        label = { Text(label) },
        singleLine = true,
        modifier = Modifier.fillMaxWidth(),
        keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(
            keyboardType = androidx.compose.ui.text.input.KeyboardType.Number,
            imeAction = androidx.compose.ui.text.input.ImeAction.Search,
        ),
        keyboardActions = androidx.compose.foundation.text.KeyboardActions(onSearch = {
            if (code.isNotBlank()) onSubmit(code).also { code = "" }
        }),
        trailingIcon = {
            IconButton(onClick = { scanBarcode(context) { onSubmit(it) } }) {
                Icon(Icons.Default.QrCodeScanner, contentDescription = "Scan with camera")
            }
        },
    )
}
