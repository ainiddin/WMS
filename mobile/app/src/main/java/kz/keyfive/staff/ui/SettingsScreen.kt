package kz.keyfive.staff.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import kz.keyfive.staff.i18n.I18n
import kz.keyfive.staff.i18n.Lang
import kz.keyfive.staff.i18n.t

/** English · Русский · Қазақша; each name in its own language, so anyone finds theirs. Saved on this phone. */
@Composable
fun LanguageChips() {
    val context = LocalContext.current
    ChipRow(Lang.entries.toList(), I18n.lang, { it.label }) { I18n.choose(context, it) }
}

@Composable
fun SettingsScreen() {
    Column(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Section(t("Language")) {
            LanguageChips()
            Hint(t("The app switches at once. Messages from the server stay in English."))
        }
    }
}
