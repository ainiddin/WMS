package kz.keyfive.staff.ui.manager

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
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
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import kz.keyfive.staff.data.Category
import kz.keyfive.staff.data.CategoryInput
import kz.keyfive.staff.data.Product
import kz.keyfive.staff.data.ProductInput
import kz.keyfive.staff.data.Session
import kz.keyfive.staff.data.Supplier
import kz.keyfive.staff.data.SupplierInput
import kz.keyfive.staff.ui.Action
import kz.keyfive.staff.ui.Badge
import kz.keyfive.staff.ui.Confirm
import kz.keyfive.staff.ui.Empty
import kz.keyfive.staff.i18n.sortedByTranslation
import kz.keyfive.staff.i18n.t
import kz.keyfive.staff.ui.Hint
import kz.keyfive.staff.ui.LoadedList
import kz.keyfive.staff.ui.load
import kz.keyfive.staff.ui.Orange
import kz.keyfive.staff.ui.Picker
import kz.keyfive.staff.ui.Red
import kz.keyfive.staff.ui.money
import kz.keyfive.staff.ui.rememberAction
import kz.keyfive.staff.ui.scanBarcode
import retrofit2.HttpException
import retrofit2.Response

/** Something that can be deleted, or deactivated when the database says it has history (409). */
private class DeleteTarget(val name: String, val delete: suspend () -> Response<Unit>, val deactivate: suspend () -> Any)

/** Delete; if records point to it, offer to deactivate instead (history must stay). */
@Composable
private fun DeleteDialog(target: DeleteTarget?, action: Action, onDone: () -> Unit, onDismiss: () -> Unit) {
    var hasHistory by remember(target) { mutableStateOf(false) }
    target ?: return
    Confirm(
        title = if (hasHistory) t("Deactivate {0}?", target.name) else t("Delete {0}?", target.name),
        text = if (hasHistory) t("It is used by orders or movements, so it cannot be deleted. Deactivate it: it disappears " +
            "from the shop but the history stays.") else t("This cannot be undone."),
        confirm = if (hasHistory) t("Deactivate") else t("Delete"),
        busy = action.busy,
        onConfirm = {
            action.run(after = onDone) {
                if (hasHistory) {
                    target.deactivate()
                    t("{0} deactivated", target.name)
                } else {
                    val response = target.delete()
                    if (response.code() == 409) {
                        hasHistory = true
                        throw IllegalStateException(t("{0} has history: deactivate it instead", target.name))
                    }
                    if (!response.isSuccessful) throw HttpException(response)
                    t("{0} deleted", target.name)
                }
            }
        },
        onDismiss = onDismiss,
    )
}

@Composable
private fun AddButton(text: String, onClick: () -> Unit) {
    OutlinedButton(onClick = onClick) { Icon(Icons.Default.Add, null); Text(text) }
}

@Composable
private fun RowActions(onEdit: () -> Unit, onDelete: () -> Unit) {
    IconButton(onClick = onEdit) { Icon(Icons.Default.Edit, t("Edit")) }
    IconButton(onClick = onDelete) { Icon(Icons.Default.Delete, t("Delete")) }
}

@Composable
private fun FormDialog(title: String, busy: Boolean, canSave: Boolean, onSave: () -> Unit, onDismiss: () -> Unit,
                       content: @Composable () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = { Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) { content() } },
        confirmButton = { Button(onClick = onSave, enabled = canSave && !busy) { Text(t("Save")) } },
        dismissButton = { TextButton(onClick = onDismiss) { Text(t("Cancel")) } },
    )
}

@Composable
private fun ActiveSwitch(label: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(label, Modifier.weight(1f))
        Switch(checked, onChange)
    }
}

// ---------------- Products ----------------
private data class ProductForm(
    val name: String = "", val description: String = "", val category: Category? = null, val supplier: Supplier? = null,
    val price: String = "", val minQuantity: String = "5", val barcode: String = "", val active: Boolean = true,
)

@Composable
fun ProductsScreen(session: Session) {
    var showInactive by remember { mutableStateOf(false) }
    val products = load(showInactive) { session.api.products(includeInactive = showInactive) }
    val categories = load { session.api.categories(includeInactive = true) }
    val suppliers = load { session.api.suppliers(includeInactive = true) }
    val action = rememberAction()
    val context = LocalContext.current
    var editing by remember { mutableStateOf<Product?>(null) }
    var form by remember { mutableStateOf<ProductForm?>(null) }
    var deleting by remember { mutableStateOf<DeleteTarget?>(null) }

    LoadedList(products, header = {
        item { Hint(t("Prices, minimum stock and barcodes. Quantity changes only through Stock IN and shipments.")) }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                AddButton(t("New product")) { editing = null; form = ProductForm() }
                FilterChip(showInactive, { showInactive = !showInactive }, label = { Text(t("Show inactive")) })
            }
        }
    }) { list ->
        if (list.isEmpty()) item { Empty(t("No products")) }
        items(list.sortedByTranslation { it.name }, key = { it.id }) { p ->
            Card(Modifier.fillMaxWidth()) {
                Row(Modifier.padding(start = 12.dp, top = 8.dp, bottom = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            Text(t(p.name), fontWeight = FontWeight.SemiBold)
                            if (!p.isActive) Badge(t("inactive"), Red)
                        }
                        Hint("${p.code} · ${t(p.category.name)} · ${money(p.unitPrice)}")
                        Hint(t("Stock {0} (min {1})", p.quantity, p.minQuantity) + (p.barcode?.let { " · $it" } ?: ""))
                    }
                    RowActions(
                        onEdit = {
                            editing = p
                            form = ProductForm(p.name, p.description.orEmpty(), p.category,
                                suppliers.data?.find { it.id == p.supplier?.id }, p.unitPrice.toBigDecimal().stripTrailingZeros().toPlainString(),
                                p.minQuantity.toString(), p.barcode.orEmpty(), p.isActive)
                        },
                        onDelete = {
                            deleting = DeleteTarget(p.name, { session.api.deleteProduct(p.id) }, { session.api.deactivateProduct(p.id) })
                        },
                    )
                }
            }
        }
    }

    form?.let { f ->
        val price = f.price.replace(',', '.').toDoubleOrNull()
        val min = f.minQuantity.toIntOrNull()
        FormDialog(
            title = editing?.let { t("Edit {0}", it.code) } ?: t("New product"),
            busy = action.busy,
            canSave = f.name.isNotBlank() && f.category != null && f.supplier != null && price != null && min != null &&
                (f.barcode.isEmpty() || f.barcode.length == 13),
            onSave = {
                val body = ProductInput(f.name.trim(), f.description.trim().ifEmpty { null }, f.category!!.id, f.supplier!!.id,
                    price!!, min!!, f.barcode.ifEmpty { null }, f.active)
                action.run(after = { form = null; products.reload() }) {
                    val saved = editing?.let { session.api.updateProduct(it.id, body) } ?: session.api.createProduct(body)
                    t("{0} saved", saved.code)
                }
            },
            onDismiss = { form = null },
        ) {
            OutlinedTextField(f.name, { form = f.copy(name = it) }, label = { Text(t("Name")) }, modifier = Modifier.fillMaxWidth())
            OutlinedTextField(f.description, { form = f.copy(description = it) }, label = { Text(t("Description")) },
                modifier = Modifier.fillMaxWidth(), minLines = 2)
            Picker(t("Category"), categories.data.orEmpty(), f.category, { t(it.name) + if (it.isActive) "" else " (" + t("inactive") + ")" }) {
                form = f.copy(category = it)
            }
            Picker(t("Supplier"), suppliers.data.orEmpty(), f.supplier, { it.supplierName }) { form = f.copy(supplier = it) }
            OutlinedTextField(f.price, { form = f.copy(price = it) }, label = { Text(t("Price, ₸")) }, singleLine = true,
                modifier = Modifier.fillMaxWidth(), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal))
            OutlinedTextField(f.minQuantity, { form = f.copy(minQuantity = it.filter(Char::isDigit)) }, label = { Text(t("Minimum stock")) },
                singleLine = true, modifier = Modifier.fillMaxWidth(), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number))
            OutlinedTextField(
                f.barcode, { form = f.copy(barcode = it.filter(Char::isDigit).take(13)) }, label = { Text(t("Barcode (EAN-13)")) },
                singleLine = true, modifier = Modifier.fillMaxWidth(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                trailingIcon = { TextButton(onClick = { scanBarcode(context) { form = form?.copy(barcode = it) } }) { Text(t("Scan")) } },
                supportingText = { if (f.barcode.isNotEmpty() && f.barcode.length != 13) Text(t("13 digits"), color = Orange) },
            )
            ActiveSwitch(t("Active (visible in the shop)"), f.active) { form = f.copy(active = it) }
        }
    }
    DeleteDialog(deleting, action, onDone = { deleting = null; products.reload() }, onDismiss = { deleting = null })
}

// ---------------- Categories ----------------
@Composable
fun CategoriesScreen(session: Session) {
    val categories = load { session.api.categories(includeInactive = true) }
    val action = rememberAction()
    var editing by remember { mutableStateOf<Category?>(null) }
    var form by remember { mutableStateOf<Pair<String, Boolean>?>(null) }
    var deleting by remember { mutableStateOf<DeleteTarget?>(null) }

    LoadedList(categories, header = {
        item { AddButton(t("New category")) { editing = null; form = "" to true } }
    }) { list ->
        items(list.sortedByTranslation { it.name }, key = { it.id }) { c ->
            Card(Modifier.fillMaxWidth()) {
                Row(Modifier.padding(start = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(t(c.name), fontWeight = FontWeight.SemiBold)
                        Hint(c.code + if (c.isActive) "" else " · " + t("inactive"))
                    }
                    RowActions(
                        onEdit = { editing = c; form = c.name to c.isActive },
                        onDelete = { deleting = DeleteTarget(c.name, { session.api.deleteCategory(c.id) }, { session.api.deactivateCategory(c.id) }) },
                    )
                }
            }
        }
    }
    form?.let { (name, active) ->
        FormDialog(if (editing == null) t("New category") else t("Edit category"), action.busy, name.isNotBlank(),
            onSave = {
                val body = CategoryInput(name.trim(), active)
                action.run(after = { form = null; categories.reload() }) {
                    (editing?.let { session.api.updateCategory(it.id, body) } ?: session.api.createCategory(body)).name.let { t("{0} saved", it) }
                }
            },
            onDismiss = { form = null },
        ) {
            OutlinedTextField(name, { form = it to active }, label = { Text(t("Name")) }, modifier = Modifier.fillMaxWidth())
            ActiveSwitch(t("Active"), active) { form = name to it }
        }
    }
    DeleteDialog(deleting, action, onDone = { deleting = null; categories.reload() }, onDismiss = { deleting = null })
}

// ---------------- Suppliers ----------------
@Composable
fun SuppliersScreen(session: Session) {
    var showInactive by remember { mutableStateOf(false) }
    val suppliers = load(showInactive) { session.api.suppliers(includeInactive = showInactive) }
    val action = rememberAction()
    var editing by remember { mutableStateOf<Supplier?>(null) }
    var form by remember { mutableStateOf<SupplierInput?>(null) }
    var deleting by remember { mutableStateOf<DeleteTarget?>(null) }

    LoadedList(suppliers, header = {
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                AddButton(t("New supplier")) { editing = null; form = SupplierInput("", "", null, true) }
                FilterChip(showInactive, { showInactive = !showInactive }, label = { Text(t("Show inactive")) })
            }
        }
    }) { list ->
        items(list, key = { it.id }) { s ->
            Card(Modifier.fillMaxWidth()) {
                Row(Modifier.padding(start = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f).padding(vertical = 8.dp)) {
                        Text(s.supplierName, fontWeight = FontWeight.SemiBold)
                        Hint("${s.code} · ${s.phone}${s.email?.let { " · $it" } ?: ""}${if (s.isActive) "" else " · " + t("inactive")}")
                    }
                    RowActions(
                        onEdit = { editing = s; form = SupplierInput(s.supplierName, s.phone, s.email, s.isActive) },
                        onDelete = { deleting = DeleteTarget(s.supplierName, { session.api.deleteSupplier(s.id) }, { session.api.deactivateSupplier(s.id) }) },
                    )
                }
            }
        }
    }
    form?.let { f ->
        FormDialog(if (editing == null) t("New supplier") else t("Edit supplier"), action.busy,
            f.supplierName.isNotBlank() && f.phone.isNotBlank(),
            onSave = {
                val body = f.copy(supplierName = f.supplierName.trim(), email = f.email?.trim()?.ifEmpty { null })
                action.run(after = { form = null; suppliers.reload() }) {
                    (editing?.let { session.api.updateSupplier(it.id, body) } ?: session.api.createSupplier(body)).supplierName.let { t("{0} saved", it) }
                }
            },
            onDismiss = { form = null },
        ) {
            OutlinedTextField(f.supplierName, { form = f.copy(supplierName = it) }, label = { Text(t("Name")) }, modifier = Modifier.fillMaxWidth())
            OutlinedTextField(f.phone, { form = f.copy(phone = it) }, label = { Text(t("Phone")) }, modifier = Modifier.fillMaxWidth(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone))
            OutlinedTextField(f.email.orEmpty(), { form = f.copy(email = it) }, label = { Text(t("Email")) }, modifier = Modifier.fillMaxWidth(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email))
            ActiveSwitch(t("Active"), f.isActive) { form = f.copy(isActive = it) }
        }
    }
    DeleteDialog(deleting, action, onDone = { deleting = null; suppliers.reload() }, onDismiss = { deleting = null })
}

// ---------------- Customers ----------------
@Composable
fun CustomersScreen(session: Session) {
    var search by remember { mutableStateOf("") }
    val customers = load(search) { session.api.customers(search.trim().ifEmpty { null }) }
    LoadedList(customers, header = {
        item { Hint(t("Contacts are visible to Managers and Admins only.")) }
        item {
            OutlinedTextField(search, { search = it }, label = { Text(t("Search by name, phone or email")) }, singleLine = true,
                modifier = Modifier.fillMaxWidth())
        }
    }) { list ->
        if (list.isEmpty()) item { Empty(t("No customers found")) }
        items(list, key = { it.id }) { c ->
            Column {
                Row {
                    Text(c.fullName, Modifier.weight(1f), fontWeight = FontWeight.SemiBold)
                    Text(money(c.balance))
                }
                Hint("${c.code}${c.phone?.let { " · $it" } ?: ""}${c.email?.let { " · $it" } ?: ""}")
                c.address?.let { Hint(it) }
            }
        }
    }
}
