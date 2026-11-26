package kz.keyfive.staff.i18n

import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue

/** The languages of the app; English is the source text, Russian and Kazakh come from RU_TEXT and KK_TEXT. */
enum class Lang(val code: String, val label: String) {
    EN("en", "English"),
    RU("ru", "Русский"),
    KK("kk", "Қазақша"),
}

/** The chosen language. A Compose state, so every screen that shows a t() text redraws at once when it changes. */
object I18n {
    var lang by mutableStateOf(Lang.EN)

    /** First start: the phone's language if the app has it, otherwise English. */
    fun fromSystem(language: String): Lang = Lang.entries.find { it.code == language } ?: Lang.EN

    private fun prefs(context: Context) = context.getSharedPreferences("settings", Context.MODE_PRIVATE)

    fun load(context: Context, systemLanguage: String) {
        lang = prefs(context).getString("lang", null)?.let { code -> Lang.entries.find { it.code == code } }
            ?: fromSystem(systemLanguage)
    }

    fun choose(context: Context, value: Lang) {
        lang = value
        prefs(context).edit().putString("lang", value.code).apply()
    }
}

/**
 * The text in the chosen language. `en` is the English text and the key of the dictionaries; a text without a
 * translation stays English. `{0}`, `{1}`… are replaced by `args` (numbers, names, dates).
 */
fun t(en: String, vararg args: Any?): String {
    val text = when (I18n.lang) {
        Lang.EN -> en
        Lang.RU -> RU_TEXT[en] ?: en
        Lang.KK -> KK_TEXT[en] ?: en
    }
    return args.foldIndexed(text) { i, s, arg -> s.replace("{$i}", arg.toString()) }
}
