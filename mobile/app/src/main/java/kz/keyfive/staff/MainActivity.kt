package kz.keyfive.staff

import android.os.Bundle
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Surface
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import kz.keyfive.staff.data.Session
import kz.keyfive.staff.ui.KeyFiveTheme
import kz.keyfive.staff.ui.StaffApp
import kz.keyfive.staff.ui.auth.AuthScreens

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Customer data and stock figures must not appear in screenshots or the "recent apps" preview
        // (debug builds allow screenshots for testing and the defence slides).
        if (!BuildConfig.DEBUG) window.setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE)
        enableEdgeToEdge()
        val session = Session(applicationContext)
        setContent {
            KeyFiveTheme {
                Surface(Modifier.fillMaxSize()) {
                    var restoring by remember { mutableStateOf(session.hasTokens) }
                    LaunchedEffect(Unit) {
                        session.restore()
                        restoring = false
                    }
                    val user = session.user
                    when {
                        restoring -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                            CircularProgressIndicator()
                        }
                        user == null -> AuthScreens(session)
                        else -> StaffApp(session, user)
                    }
                }
            }
        }
    }
}
