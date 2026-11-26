package kz.keyfive.staff.i18n

import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class I18nTest {
    @After
    fun backToEnglish() {
        I18n.lang = Lang.EN
    }

    @Test
    fun `English is the key itself, placeholders are filled in`() {
        assertEquals("Order ORD-1 shipped", t("Order {0} shipped", "ORD-1"))
        assertEquals("No such text", t("No such text"))
    }

    @Test
    fun `Russian and Kazakh come from the dictionaries, with placeholders in their own word order`() {
        I18n.lang = Lang.RU
        assertEquals("Заказ ORD-1 отгружен", t("Order {0} shipped", "ORD-1"))
        I18n.lang = Lang.KK
        assertEquals("3 дананың 2-і", t("{0} of {1} units", 2, 3))
        assertEquals("A text nobody translated", t("A text nobody translated")) // falls back to English
    }

    @Test
    fun `first start follows the phone language, unknown languages get English`() {
        assertEquals(Lang.RU, I18n.fromSystem("ru"))
        assertEquals(Lang.KK, I18n.fromSystem("kk"))
        assertEquals(Lang.EN, I18n.fromSystem("de"))
        assertEquals(Lang.EN, I18n.fromSystem(""))
    }

    @Test
    fun `every text in the code has a Russian and a Kazakh translation`() {
        val literal = "\"((?:[^\"\\\\]|\\\\.)*)\""
        val call = Regex("""(?<![\w.])t\(\s*$literal((?:\s*\+\s*$literal)*)""")
        val keys = File("src/main/java").walk().filter { it.extension == "kt" && "i18n" !in it.path }
            .flatMap { file -> call.findAll(file.readText()).map { m ->
                (listOf(m.groupValues[1]) + Regex(literal).findAll(m.groupValues[2]).map { it.groupValues[1] })
                    .joinToString("").replace("\\\"", "\"").replace("\\$", "$")
            } }
            .toSet()
        assertTrue("found only ${keys.size} texts: is the source folder right?", keys.size > 300)
        val missingRu = keys.filter { it !in RU_TEXT }
        val missingKk = keys.filter { it !in KK_TEXT }
        assertEquals("no Russian for: $missingRu (add them to i18n/mobile.txt)", emptyList<String>(), missingRu)
        assertEquals("no Kazakh for: $missingKk (add them to i18n/mobile.txt)", emptyList<String>(), missingKk)
    }
}
