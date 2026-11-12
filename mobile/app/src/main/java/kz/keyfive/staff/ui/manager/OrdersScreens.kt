package kz.keyfive.staff.ui.manager

import android.content.Intent
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import kotlinx.serialization.json.JsonPrimitive
import kz.keyfive.staff.data.Order
import kz.keyfive.staff.data.RejectRequest
import kz.keyfive.staff.data.Session
import kz.keyfive.staff.ui.Badge
import kz.keyfive.staff.ui.BarRow
import kz.keyfive.staff.ui.ChipRow
import kz.keyfive.staff.ui.Confirm
import kz.keyfive.staff.ui.Empty
import kz.keyfive.staff.ui.Green
import kz.keyfive.staff.ui.Hint
import kz.keyfive.staff.ui.LoadedList
import kz.keyfive.staff.ui.Orange
import kz.keyfive.staff.ui.Red
import kz.keyfive.staff.ui.Section
import kz.keyfive.staff.ui.StatTile
import kz.keyfive.staff.ui.TileRow
import kz.keyfive.staff.ui.dateTime
import kz.keyfive.staff.ui.eta
import kz.keyfive.staff.ui.load
import kz.keyfive.staff.ui.money
import kz.keyfive.staff.ui.num
import kz.keyfive.staff.ui.orderStatusLabel
import kz.keyfive.staff.ui.rememberAction
import kz.keyfive.staff.ui.statusColor
import kz.keyfive.staff.ui.toast
import kz.keyfive.staff.ui.warehouse.OrderMeta
import java.io.File

// ---------------- Orders ----------------
private val TABS = listOf("APPROVED", "PENDING", "SHIPPED", "REJECTED", "CANCELLED", null)

@Composable
fun OrdersScreen(session: Session) {
    var tab by remember { mutableStateOf<String?>("APPROVED") }
    val orders = load(tab) { session.api.orders(tab) }
    val workload = load { session.api.workload() }
    val rebalance = rememberAction()
    var open by remember { mutableStateOf<Order?>(null) }

    LoadedList(orders, header = {
        item {
            Section("Worker workload", action = {
                TextButton(enabled = !rebalance.busy, onClick = {
                    rebalance.run(after = { workload.reload(); orders.reload() }) {
                        val moved = session.api.rebalance().moved
                        if (moved > 0) "$moved orders moved to other Workers" else "Already balanced: nothing to move"
                    }
                }) { Text("Rebalance") }
            }) {
                val rows = workload.data.orEmpty()
                val max = rows.maxOfOrNull { it.openUnits }?.coerceAtLeast(1) ?: 1
                if (rows.isEmpty()) Hint("No active Workers: approved orders wait in a common queue.")
                rows.forEach {
                    BarRow(it.worker.fullName, it.openUnits.toFloat(), max.toFloat(), "${it.openOrders} ord · ${it.openUnits} u")
                }
            }
        }
        item { ChipRow(TABS, tab, { orderStatusLabel[it] ?: "All" }) { tab = it } }
    }) { list ->
        if (list.isEmpty()) item { Empty("No orders here") }
        items(list, key = { it.id }) { o ->
            Card(Modifier.fillMaxWidth().clickable { open = o }) {
                Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(o.code, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                        Badge(orderStatusLabel[o.status] ?: o.status, statusColor(o.status))
                    }
                    Text("${o.customer.fullName} · ${money(o.total)} · ${o.items.size} lines")
                    Hint(buildString {
                        append(dateTime(o.createdAt))
                        (if (o.status == "SHIPPED") o.shippedBy else o.assignedTo)?.let { append(" · ${it.fullName}") }
                        if (o.status == "PENDING") eta(o.etaMin, o.etaMax)?.let { append(" · ETA $it") }
                    })
                }
            }
        }
    }
    open?.let { order ->
        OrderDialog(session, order, onClose = { open = null }, onChanged = { open = null; orders.reload(); workload.reload() })
    }
}

@Composable
private fun OrderDialog(session: Session, order: Order, onClose: () -> Unit, onChanged: () -> Unit) {
    val action = rememberAction()
    var rejecting by remember { mutableStateOf(false) }
    var reason by remember { mutableStateOf("") }
    var cancelling by remember { mutableStateOf(false) }
    val active = order.status == "PENDING" || order.status == "APPROVED"

    AlertDialog(
        onDismissRequest = onClose,
        title = { Text("Order ${order.code}") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Badge(orderStatusLabel[order.status] ?: order.status, statusColor(order.status))
                OrderMeta(order)
                Hint("Created ${dateTime(order.createdAt)}" + (order.approvedAt?.let { " · approved ${dateTime(it)}" } ?: "") +
                    (order.shippedAt?.let { " · shipped ${dateTime(it)}" } ?: ""))
                order.approvedBy?.let { Hint("Approved by ${it.fullName}") }
                order.shippedBy?.let { Hint("Shipped by ${it.fullName}") }
                order.rejectionReason?.let { Text("Reason: $it", color = Red) }
                order.waiting?.let { waiting ->
                    Text("Waiting for stock" + (eta(order.etaMin, order.etaMax)?.let { " · ETA $it" } ?: ""), color = Orange)
                    waiting.forEach { Hint("${it.productName}: ${it.missing} missing") }
                    Hint("The system approves it and gives it to a Worker as soon as the goods arrive (stock IN).")
                }
                order.items.forEach { item ->
                    Row {
                        Text("${item.quantity} × ${item.productName}", Modifier.weight(1f))
                        Text(money(item.lineTotal))
                    }
                }
                Text("Total ${money(order.total)}" + (order.paymentStatus?.let { " · $it" } ?: " · on delivery"),
                    fontWeight = FontWeight.SemiBold)
                if (rejecting) {
                    OutlinedTextField(reason, { reason = it }, label = { Text("Reason (shown to the customer)") },
                        modifier = Modifier.fillMaxWidth())
                }
                if (active) {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        if (rejecting) {
                            Button(onClick = {
                                action.run(after = onChanged) {
                                    "Order ${session.api.rejectOrder(order.id, RejectRequest(reason.trim().ifEmpty { null })).code} rejected"
                                }
                            }, enabled = !action.busy, colors = ButtonDefaults.buttonColors(containerColor = Red)) { Text("Confirm reject") }
                        } else {
                            OutlinedButton(onClick = { rejecting = true }) { Text("Reject", color = Red) }
                            if (order.status == "PENDING" && order.waiting == null) {
                                Button(onClick = {
                                    action.run(after = onChanged) { "Order ${session.api.approveOrder(order.id).code} approved" }
                                }, enabled = !action.busy, colors = ButtonDefaults.buttonColors(containerColor = Green)) { Text("Approve now") }
                            }
                        }
                    }
                    TextButton(onClick = { cancelling = true }) { Text("Cancel order", color = Red) }
                }
            }
        },
        confirmButton = { TextButton(onClick = onClose) { Text("Close") } },
    )
    if (cancelling) {
        Confirm("Cancel order ${order.code}?",
            "The order is not shipped yet, so stock is not changed. The money goes back to the customer's account.",
            "Cancel order", action.busy,
            onConfirm = { action.run(after = onChanged) { "Order ${session.api.cancelOrder(order.id).code} cancelled" } },
            onDismiss = { cancelling = false })
    }
}

// ---------------- Dashboard ----------------
@Composable
fun DashboardScreen(session: Session) {
    val data = load { session.api.dashboard() }
    LoadedList(data) { d ->
        val c = d.cards
        item {
            TileRow(
                { StatTile("Below minimum", num(c.productsBelowMin), it, "${c.productsOutOfStock} out of stock",
                    if (c.productsBelowMin > 0) Orange else null) },
                { StatTile("To ship", num(c.ordersToShip), it, "${c.ordersPending} waiting for stock") },
            )
        }
        item {
            TileRow(
                { StatTile("Shipped this month", num(c.ordersShippedMonth), it, money(c.revenueMonth)) },
                { StatTile("Stock value", money(c.stockValue), it, "${c.productsActive} active products") },
            )
        }
        item {
            Section("Revenue by month") {
                val max = d.salesByMonth.maxOfOrNull { it.revenue }?.toFloat() ?: 0f
                d.salesByMonth.takeLast(12).forEach { BarRow(it.month, it.revenue.toFloat(), max, money(it.revenue)) }
            }
        }
        item {
            Section("Stock movements by month (units)") {
                val max = d.movementsByMonth.maxOfOrNull { maxOf(it.unitsIn, it.out) }?.toFloat() ?: 0f
                d.movementsByMonth.takeLast(6).forEach {
                    BarRow("${it.month} IN", it.unitsIn.toFloat(), max, num(it.unitsIn), Green)
                    BarRow("${it.month} OUT", it.out.toFloat(), max, num(it.out), Red)
                }
            }
        }
        item {
            Section("Sales by category") {
                val max = d.salesByCategory.maxOfOrNull { it.revenue }?.toFloat() ?: 0f
                d.salesByCategory.forEach { BarRow(it.category, it.revenue.toFloat(), max, money(it.revenue)) }
            }
        }
        item {
            Section("Top customers") {
                d.topCustomers.forEach {
                    Row { Text(it.fullName, Modifier.weight(1f)); Text(money(it.total)) }
                    Hint("${it.ordersShipped} orders shipped")
                }
            }
        }
        item {
            Section("Restock now") {
                if (d.restock.isEmpty()) Hint("Nothing to reorder")
                d.restock.forEach {
                    Row { Text(it.productName, Modifier.weight(1f)); Text("${it.quantity} / ${it.minQuantity}", color = Orange) }
                }
            }
        }
    }
}

// ---------------- Restock ----------------
@Composable
fun RestockScreen(session: Session, openStockIn: () -> Unit) {
    val rows = load { session.api.restock() }
    val context = LocalContext.current
    LoadedList(rows, header = {
        item { Hint("Products below their minimum and whom to call. Shortage = amount needed to reach the minimum.") }
    }) { list ->
        if (list.isEmpty()) item { Empty("Nothing to reorder", "All active products are at or above their minimum.") }
        items(list, key = { it.productId }) { r ->
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Row {
                        Text(r.productName, Modifier.weight(1f), fontWeight = FontWeight.SemiBold)
                        Text("short ${r.shortage}", color = if (r.quantity == 0) Red else Orange)
                    }
                    Hint("${r.productCode} · in stock ${r.quantity} of minimum ${r.minQuantity}")
                    Text(r.supplierName)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedButton(onClick = {
                            context.startActivity(Intent(Intent.ACTION_DIAL, android.net.Uri.parse("tel:${r.supplierPhone}")))
                        }) { Text("Call ${r.supplierPhone}") }
                        TextButton(onClick = openStockIn) { Text("Stock IN") }
                    }
                }
            }
        }
    }
}

// ---------------- Reports ----------------
private class Report(val name: String, val label: String, val description: String, val title: String, val lines: List<String>)

private val REPORTS = listOf(
    Report("monthly-usage", "Monthly usage", "Units shipped (OUT) per product and month, last 12 months.",
        "product_name", listOf("month", "product_code", "units_out", "movements")),
    Report("top-customers", "Top customers", "Customers by the value of shipped orders.",
        "full_name", listOf("customer_code", "orders_shipped", "units", "total_amount")),
    Report("reconciliation", "Reconciliation",
        "Stock in the products table vs SUM(IN) − SUM(OUT) from the movement history. Every row should be OK.",
        "product_name", listOf("product_code", "quantity", "total_in", "total_out", "difference", "ok")),
    Report("orders", "Orders", "All orders with status, totals and who handled them.",
        "code", listOf("created_at", "customer", "status", "items", "total_amount", "approved_by", "shipped_by")),
)

@Composable
fun ReportsScreen(session: Session) {
    var report by remember { mutableStateOf(REPORTS[0]) }
    val rows = load(report.name) { session.api.report(report.name) }
    val export = rememberAction()
    val context = LocalContext.current

    /** Downloads the file and opens it in Excel / a PDF viewer / any app that can share it. */
    fun download(format: String) = export.run {
        val response = session.api.exportReport(report.name, format)
        val body = response.body() ?: throw retrofit2.HttpException(response)
        val name = Regex("filename=\"?([^\";]+)").find(response.headers()["Content-Disposition"].orEmpty())
            ?.groupValues?.get(1) ?: "${report.name}.$format"
        val file = File(context.cacheDir, "reports/$name").apply { parentFile?.mkdirs() }
        body.byteStream().use { input -> file.outputStream().use { input.copyTo(it) } }
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.files", file)
        val type = if (format == "pdf") "application/pdf" else "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        val intent = Intent(Intent.ACTION_VIEW).setDataAndType(uri, type).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        try {
            context.startActivity(Intent.createChooser(intent, name))
        } catch (_: Exception) {
            context.toast("No app to open $name")
        }
        "Downloaded $name"
    }

    LoadedList(rows, header = {
        item { ChipRow(REPORTS, report, { it.label }) { report = it } }
        item {
            Hint(report.description)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = { download("xlsx") }, enabled = !export.busy) { Text("Excel") }
                OutlinedButton(onClick = { download("pdf") }, enabled = !export.busy) { Text("PDF") }
            }
        }
    }) { list ->
        if (list.isEmpty()) item { Empty("No data yet") }
        items(list.take(300)) { row ->
            fun value(key: String): String {
                val v = row[key] as? JsonPrimitive ?: return "—"
                return when {
                    v.content == "null" -> "—"
                    key.contains("amount") -> v.content.toDoubleOrNull()?.let(::money) ?: v.content
                    key == "ok" -> if (v.content == "true") "OK" else "MISMATCH"
                    else -> v.content
                }
            }
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(12.dp)) {
                    Text(value(report.title), fontWeight = FontWeight.SemiBold)
                    report.lines.forEach { key ->
                        Row {
                            Text(key.replace('_', ' '), style = MaterialTheme.typography.bodySmall, modifier = Modifier.weight(1f),
                                color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Text(value(key), style = MaterialTheme.typography.bodySmall,
                                color = if (key == "ok" && value(key) != "OK") Red else MaterialTheme.colorScheme.onSurface)
                        }
                    }
                }
            }
        }
        if (list.size > 300) item { Hint("Showing 300 of ${list.size} rows. Download Excel for all of them.") }
    }
}
