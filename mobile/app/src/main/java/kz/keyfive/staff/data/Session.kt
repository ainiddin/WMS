package kz.keyfive.staff.data

import android.content.Context
import android.content.SharedPreferences
import android.os.Build
import android.util.Base64
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import kz.keyfive.staff.BuildConfig
import okhttp3.Authenticator
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import okhttp3.Route
import retrofit2.HttpException
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import java.io.IOException
import java.security.SecureRandom
import java.util.concurrent.TimeUnit

val json = Json { ignoreUnknownKeys = true; explicitNulls = false }

/**
 * Who is signed in, the tokens and this phone's secret. Everything is kept in EncryptedSharedPreferences
 * (key in the Android Keystore) and is excluded from backups, so the secret never leaves the phone.
 */
class Session(context: Context) {
    private val prefs: SharedPreferences = EncryptedSharedPreferences.create(
        context,
        "keyfive_session",
        MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(),
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
    )

    var user by mutableStateOf<User?>(null)
        private set

    var server: String
        get() = prefs.getString("server", null) ?: BuildConfig.DEFAULT_SERVER
        set(value) {
            prefs.edit().putString("server", value.trim().trimEnd('/')).apply()
            api = buildApi()
        }

    private var access: String?
        get() = prefs.getString("access", null)
        set(value) = prefs.edit().putString("access", value).apply()

    private var refresh: String?
        get() = prefs.getString("refresh", null)
        set(value) = prefs.edit().putString("refresh", value).apply()

    val hasTokens get() = access != null

    /** 32 random bytes made once per install. The Admin approves this phone, not the password. */
    val deviceSecret: String
        get() = prefs.getString("device_secret", null) ?: run {
            val bytes = ByteArray(32).also { SecureRandom().nextBytes(it) }
            val secret = Base64.encodeToString(bytes, Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP)
            prefs.edit().putString("device_secret", secret).apply()
            secret
        }

    val deviceName: String = "${Build.MANUFACTURER} ${Build.MODEL}".trim().take(100)

    var api: Api = buildApi()
        private set

    suspend fun login(email: String, password: String) {
        val pair = api.staffLogin(StaffLoginRequest(email.trim(), password, deviceSecret, deviceName))
        save(pair)
    }

    /** On start: check the saved token (the phone may have been blocked meanwhile). */
    suspend fun restore() {
        if (!hasTokens) return
        try {
            user = api.me()
        } catch (e: HttpException) {
            if (e.code() == 401 || e.code() == 403) logout()
        }
    }

    suspend fun reloadUser() {
        user = api.me()
    }

    fun logout() {
        prefs.edit().remove("access").remove("refresh").apply()
        user = null
    }

    private fun save(pair: TokenPair) {
        access = pair.accessToken
        refresh = pair.refreshToken
        user = pair.user
    }

    private fun buildApi(): Api {
        val client = OkHttpClient.Builder()
            .connectTimeout(60, TimeUnit.SECONDS) // the free server sleeps and needs ~1 minute to wake up
            .readTimeout(90, TimeUnit.SECONDS)
            .addInterceptor(Interceptor { chain ->
                val token = access
                val request = chain.request()
                chain.proceed(if (token == null) request else request.withToken(token))
            })
            .authenticator(TokenRefresher())
            .build()
        return Retrofit.Builder()
            .baseUrl("$server/api/")
            .client(client)
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
            .build()
            .create(Api::class.java)
    }

    private fun Request.withToken(token: String) = newBuilder().header("Authorization", "Bearer $token").build()

    /** 401 -> one refresh with the refresh token, then the request is repeated. A failed refresh signs out. */
    private inner class TokenRefresher : Authenticator {
        private val plain = OkHttpClient.Builder().connectTimeout(60, TimeUnit.SECONDS).build()

        @Synchronized
        override fun authenticate(route: Route?, response: Response): Request? {
            if (response.request.url.encodedPath.contains("/auth/")) return null
            val sent = response.request.header("Authorization")?.removePrefix("Bearer ")
            val current = access
            if (current != null && current != sent) return response.request.withToken(current) // refreshed meanwhile
            val token = refresh ?: return null
            val body = json.encodeToString(RefreshRequest.serializer(), RefreshRequest(token))
                .toRequestBody("application/json".toMediaType())
            val refreshed = try {
                plain.newCall(Request.Builder().url("$server/api/auth/refresh/").post(body).build()).execute()
            } catch (_: IOException) {
                return null
            }
            refreshed.use {
                if (!it.isSuccessful) {
                    logout()
                    return null
                }
                val pair = json.decodeFromString(TokenPair.serializer(), it.body!!.string())
                save(pair)
                return response.request.withToken(pair.accessToken)
            }
        }
    }
}

/** Human-readable message from a FastAPI error ({"detail": "..."} or a validation list). */
fun Throwable.message(): String = when (this) {
    is HttpException -> {
        val body = response()?.errorBody()?.string().orEmpty()
        val detail = runCatching { json.parseToJsonElement(body).jsonObject["detail"] }.getOrNull()
        when {
            detail is JsonPrimitive -> detail.content
            detail != null -> runCatching {
                (detail as kotlinx.serialization.json.JsonArray).joinToString("; ") { item ->
                    val obj = item.jsonObject
                    val field = obj["loc"]?.let { loc ->
                        (loc as kotlinx.serialization.json.JsonArray).map { (it as JsonPrimitive).content }
                            .filter { it != "body" }.joinToString(".")
                    }
                    val msg = (obj["msg"] as? JsonPrimitive)?.content.orEmpty()
                    if (field.isNullOrEmpty()) msg else "$field: $msg"
                }
            }.getOrDefault("Request failed (${code()})")
            else -> "Request failed (${code()})"
        }
    }
    is IOException -> "Cannot reach the server. Check the internet connection (the server may need a minute to wake up)."
    else -> localizedMessage ?: "Something went wrong"
}
