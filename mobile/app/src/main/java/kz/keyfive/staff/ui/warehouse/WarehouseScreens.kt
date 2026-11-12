package kz.keyfive.staff.ui.warehouse

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.RadioButtonUnchecked
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kz.keyfive.staff.data.Order
import kz.keyfive.staff.data.OrderItem
import kz.keyfive.staff.data.Product
import kz.keyfive.staff.data.Session
import kz.keyfive.staff.data.StockInRequest
import kz.keyfive.staff.data.User
import kz.keyfive.staff.data.message
import kz.keyfive.staff.ui.Badge
import kz.keyfive.staff.ui.BarcodeField
import kz.keyfive.staff.ui.ChipRow
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
import kz.keyfive.staff.ui.money
import kz.keyfive.staff.ui.num
import kz.keyfive.staff.ui.rememberAction

// ---------------- Stock ----------------
@Composable
fun StockScreen(session: Session) {
    val products = load { session.api.products() }
    var search by remember { mutableStateOf("") }
    var lowOnly by remember { mutableStateOf(false) }

    LoadedList(products, header = {
        item {
            OutlinedTextField(search, { search = it }, label = { Text("Search by name, code or barcode") },
                singleLine = true, modifier = Modifier.fillMaxWidth())
        }
        item {
            val low = products.data?.count { it.belowMin } ?: 0
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilterChip(selected = lowOnly, onClick = { lowOnly = !lowOnly }, label = { Text("Below minimum ($low)") })
                BarcodeScanChip { search = it }
            }
        }
    }) { list ->
        val q = search.trim().lowercase()
        val rows = list.filter {
            (q.isEmpty() || q in it.name.lowercase() || q in it.code.lowercase() || it.barcode?.contains(q) == true) &&
                (!lowOnly || it.belowMin)
        }
        if (rows.isEmpty()) item { Empty("No products match") }
        items(rows, key = { it.id }) { ProductStockCard(it) }
    }
}

@Composable
private fun BarcodeScanChip(onCode: (String) -> Unit) {
    val context = LocalContext.current
    FilterChip(selected = false, onClick = { kz.keyfive.staff.ui.scanBarcode(context, onCode) }, label = { Text("Scan") })
}

@Composable
fun ProductStockCard(p: Product) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(p.name, style = MaterialTheme.typography.titleSmall)
                    Hint("${p.code} · ${p.category.name}${p.barcode?.let { " · $it" } ?: ""}")
                }
                Text(num(p.quantity), style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold,
                    color = if (p.quantity == 0) Red else if (p.belowMin) Orange else MaterialTheme.colorScheme.onSurface)
            }
            val color = if (p.quantity == 0) Red else if (p.belowMin) Orange else Green
            LinearProgressIndicator(
                progress = { if (p.minQuantity == 0) 1f else (p.quantity / (p.minQuantity * 3f)).coerceIn(0f, 1f) },
                modifier = Modifier.fillMaxWidth(), color = color, trackColor = color.copy(alpha = 0.15f), drawStopIndicator = {},
            )
            Row {
                Hint("Minimum ${p.minQuantity} · updated ${dateTime(p.lastUpdated)}")
                if (p.belowMin) {
                    Row(Modifier.weight(1f), horizontalArrangement = Arrangement.End) {
                        Badge(if (p.quantity == 0) "Out of stock" else "Below min", color)
                    }
                }
            }
        }
    }
}

// ---------------- Stock IN ----------------
@Composable
fun StockInScreen(session: Session) {
    val products = load { session.api.products() }
    val recent = load { session.api.movements(type = "IN", limit = 8) }
    val action = rememberAction()
    val scope = rememberCoroutineScope()
    var selected by remember { mutableStateOf<Product?>(null) }
    var quantity by remember { mutableStateOf("") }
    var note by remember { mutableStateOf("") }
    var lookupError by remember { mutableStateOf<String?>(null) }

    LoadedList(recent, header = {
        item {
            Section {
                Hint("Register goods received from a supplier. Scan the barcode or pick the product.")
                BarcodeField { code ->
                    lookupError = null
                    scope.launch {
                        try {
                            selected = session.api.productByBarcode(code)
                        } catch (e: Exception) {
                            lookupError = e.message()
                        }
                    }
                }
                lookupError?.let { Text(it, color = Orange) }
                Picker("Product", products.data?.filter { it.isActive }.orEmpty(), selected,
                    { "${it.code} · ${it.name}" }) { selected = it }
                selected?.let {
                    Text("${it.name} — now in stock: ${it.quantity} (minimum ${it.minQuantity})",
                        color = if (it.belowMin) Orange else MaterialTheme.colorScheme.onSurfaceVariant)
                }
                OutlinedTextField(quantity, { quantity = it.filter(Char::isDigit).take(6) }, label = { Text("Quantity received") },
                    singleLine = true, modifier = Modifier.fillMaxWidth(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number))
                OutlinedTextField(note, { note = it }, label = { Text("Note (invoice number, supplier…)") },
                    singleLine = true, modifier = Modifier.fillMaxWidth())
                Button(
                    onClick = {
                        val product = selected ?: return@Button
                        action.run(after = {
                            selected = null; quantity = ""; note = ""
                            products.reload(); recent.reload()
                        }) {
                            val m = session.api.stockIn(StockInRequest(product.id, quantity.toInt(), note.trim().ifEmpty { null }))
                            "${m.code}: +${m.quantity} × ${m.productName}"
                        }
                    },
                    enabled = selected != null && (quantity.toIntOrNull() ?: 0) > 0 && !action.busy,
                    modifier = Modifier.fillMaxWidth(),
                ) { Text("Save stock IN") }
            }
        }
        item { Text("Latest stock IN", style = MaterialTheme.typography.titleMedium) }
    }) { list ->
        items(list, key = { it.id }) { m ->
            Column {
                Text("+${m.quantity} × ${m.productName}")
                Hint("${m.code} · ${dateTime(m.time)} · ${m.employeeName}")
            }
        }
    }
}

// ---------------- Orders to ship ----------------
@Composable
fun ToShipScreen(session: Session, user: User) {
    val orders = load { session.api.orders("APPROVED") }
    var picking by remember { mutableStateOf<Order?>(null) }
    // New orders are given to Workers automatically: refresh every 20 s like the website did.
    androidx.compose.runtime.LaunchedEffect(Unit) {
        while (true) {
            delay(20_000)
            orders.reload()
        }
    }
    val isWorker = user.role == "WORKER"

    LoadedList(orders) { list ->
        val mine = list.filter { isWorker && it.assignedTo?.id == user.employeeId }
        val others = list - mine.toSet()
        if (isWorker) {
            item {
                Text("Assigned to you · ${mine.size} orders, ${mine.sumOf { o -> o.items.sumOf { it.quantity } }} units",
                    style = MaterialTheme.typography.titleMedium)
            }
            if (mine.isEmpty()) item { Empty("Nothing assigned to you", "New orders appear here automatically.") }
            items(mine, key = { it.id }) { ShipCard(it, mine = true) { picking = it } }
        }
        if (!isWorker || others.isNotEmpty()) {
            item {
                Text(if (isWorker) "Other Workers' orders (take over if a colleague is away)" else "All approved orders",
                    style = MaterialTheme.typography.titleMedium)
            }
            if (others.isEmpty()) item { Empty("Nothing to ship", "Approved orders will appear here.") }
            items(others, key = { it.id }) { ShipCard(it, mine = !isWorker) { picking = it } }
        }
    }
    picking?.let { PickDialog(session, it, onClose = { picking = null }, onShipped = { picking = null; orders.reload() }) }
}

@Composable
private fun ShipCard(order: Order, mine: Boolean, onShip: () -> Unit) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(order.code, style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                Hint("approved ${dateTime(order.approvedAt)}")
            }
            OrderMeta(order)
            order.items.forEach { item ->
                Row {
                    Text("${item.quantity} × ${item.productName}", modifier = Modifier.weight(1f))
                    item.available?.let { Hint("in stock $it") }
                }
            }
            if (mine) {
                Button(onClick = onShip, modifier = Modifier.fillMaxWidth()) { Text("Pick & ship") }
            } else {
                OutlinedButton(onClick = onShip, modifier = Modifier.fillMaxWidth()) { Text("Take over & ship") }
            }
        }
    }
}

@Composable
fun OrderMeta(order: Order) {
    Column {
        Text("${order.customer.fullName} · ${money(order.total)}")
        Hint(order.deliveryAddress)
        order.comment?.let { Hint("Comment: $it") }
        order.assignedTo?.let { Hint("Worker: ${it.fullName}") }
    }
}

/**
 * Picking: every unit is counted. The first unit of a line must be scanned (proves the right product is in hand);
 * after that the rest can be scanned again, added with +, or typed in. Lines without a barcode are counted by hand.
 * Shipping is possible only when every line has exactly the ordered quantity.
 */
@Composable
private fun PickDialog(session: Session, order: Order, onClose: () -> Unit, onShipped: () -> Unit) {
    val picked = remember { mutableStateMapOf<Int, Int>() }
    var message by remember { mutableStateOf<Pair<Boolean, String>?>(null) }
    val action = rememberAction()

    fun count(item: OrderItem) = picked[item.id] ?: 0
    fun unlocked(item: OrderItem) = item.barcode == null || count(item) > 0
    fun setCount(item: OrderItem, n: Int) {
        val min = if (item.barcode != null) 1 else 0 // a scanned line keeps at least the scanned unit
        picked[item.id] = n.coerceIn(min, item.quantity)
    }

    fun onScan(code: String) {
        val item = order.items.find { it.barcode == code }
        message = when {
            item == null -> false to "Barcode $code is not in this order — wrong product"
            count(item) >= item.quantity -> false to "All ${item.quantity} × ${item.productName} are already picked — put this one back"
            else -> {
                picked[item.id] = count(item) + 1
                true to "${item.productName}: ${count(item)} of ${item.quantity}"
            }
        }
    }

    val total = order.items.sumOf { it.quantity }
    val done = order.items.sumOf { count(it) }
    val allPicked = order.items.all { count(it) == it.quantity }

    Dialog(onDismissRequest = onClose, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Card(Modifier.fillMaxSize().systemBarsPadding().imePadding().padding(8.dp)) {
            LazyColumn(Modifier.weight(1f).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                item { Text("Ship order ${order.code}", style = MaterialTheme.typography.titleLarge) }
                item { OrderMeta(order) }
                item { BarcodeField("Scan every unit", ::onScan) }
                message?.let { (ok, text) ->
                    item {
                        Card(colors = CardDefaults.cardColors(containerColor = (if (ok) Green else Red).copy(alpha = 0.12f))) {
                            Text(text, Modifier.padding(12.dp), color = if (ok) Green else Red)
                        }
                    }
                }
                item {
                    Row { Hint("Picked"); Text("$done of $total units", Modifier.weight(1f), textAlign = TextAlign.End, fontWeight = FontWeight.SemiBold) }
                    LinearProgressIndicator(progress = { done / total.toFloat() }, modifier = Modifier.fillMaxWidth(),
                        color = if (allPicked) Green else MaterialTheme.colorScheme.primary, drawStopIndicator = {})
                }
                items(order.items, key = { it.id }) { item ->
                    val n = count(item)
                    val open = unlocked(item)
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(if (n == item.quantity) Icons.Default.CheckCircle else Icons.Default.RadioButtonUnchecked, null,
                            tint = if (n == item.quantity) Green else MaterialTheme.colorScheme.outline)
                        Column(Modifier.weight(1f).padding(horizontal = 8.dp)) {
                            Text("${item.quantity} × ${item.productName}")
                            Text(
                                if (item.barcode != null) "${item.productCode} · ${item.barcode}${if (open) "" else " · scan it first"}"
                                else "${item.productCode} · no barcode: count by hand",
                                style = MaterialTheme.typography.bodySmall, fontFamily = FontFamily.Monospace,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        IconButton(onClick = { setCount(item, n - 1) }, enabled = open && n > (if (item.barcode != null) 1 else 0)) {
                            Icon(Icons.Default.Remove, "One less")
                        }
                        OutlinedTextField(
                            value = n.toString(),
                            onValueChange = { v -> setCount(item, v.filter(Char::isDigit).take(5).toIntOrNull() ?: 0) },
                            enabled = open, singleLine = true, modifier = Modifier.width(64.dp),
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                            textStyle = MaterialTheme.typography.bodyMedium.copy(textAlign = TextAlign.Center),
                        )
                        IconButton(onClick = { setCount(item, n + 1) }, enabled = open && n < item.quantity) {
                            Icon(Icons.Default.Add, "One more")
                        }
                    }
                }
            }
            Row(Modifier.fillMaxWidth().padding(16.dp), horizontalArrangement = Arrangement.End) {
                TextButton(onClick = onClose) { Text("Cancel") }
                Button(
                    onClick = { action.run(after = onShipped) { "Order ${session.api.shipOrder(order.id).code} shipped" } },
                    enabled = allPicked && !action.busy,
                ) { Text("Ship (OUT)") }
            }
        }
    }
}

// ---------------- Movement history ----------------
@Composable
fun HistoryScreen(session: Session) {
    var type by remember { mutableStateOf<String?>(null) }
    val movements = load(type) { session.api.movements(type = type, limit = 200) }
    LoadedList(movements, header = {
        item { ChipRow(listOf(null, "IN", "OUT"), type, { it ?: "IN and OUT" }) { type = it } }
    }) { list ->
        if (list.isEmpty()) item { Empty("No movements") }
        items(list, key = { it.id }) { m ->
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(m.productName)
                    Hint("${m.code} · ${dateTime(m.time)} · ${m.employeeName}")
                    m.customerName?.let { Hint("$it${m.orderCode?.let { c -> " · $c" } ?: ""}") }
                    m.note?.let { Hint(it) }
                }
                Text((if (m.type == "IN") "+" else "−") + m.quantity, fontWeight = FontWeight.Bold,
                    color = if (m.type == "IN") Green else Red)
            }
        }
        if (list.size == 200) item { Hint("Showing the latest 200 records.") }
    }
}
