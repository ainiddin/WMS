package kz.keyfive.staff.data

import okhttp3.ResponseBody
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query
import retrofit2.http.Streaming

/** The FastAPI endpoints used by staff (base URL = server + "/api/"). */
interface Api {
    // ---- Auth ----
    @POST("auth/staff/login/")
    suspend fun staffLogin(@Body body: StaffLoginRequest): TokenPair

    @GET("auth/me/")
    suspend fun me(): User

    @POST("auth/send-code/")
    suspend fun sendCode(@Body body: SendCodeRequest): Detail

    @POST("auth/register-staff/")
    suspend fun registerStaff(@Body body: StaffRegisterRequest): Detail

    // ---- Catalog ----
    @GET("categories/")
    suspend fun categories(@Query("include_inactive") includeInactive: Boolean = false): List<Category>

    @POST("categories/")
    suspend fun createCategory(@Body body: CategoryInput): Category

    @PATCH("categories/{id}/")
    suspend fun updateCategory(@Path("id") id: Int, @Body body: CategoryInput): Category

    @PATCH("categories/{id}/")
    suspend fun deactivateCategory(@Path("id") id: Int, @Body body: Deactivate = Deactivate()): Category

    @DELETE("categories/{id}/")
    suspend fun deleteCategory(@Path("id") id: Int): Response<Unit>

    @GET("suppliers/")
    suspend fun suppliers(@Query("include_inactive") includeInactive: Boolean = false): List<Supplier>

    @POST("suppliers/")
    suspend fun createSupplier(@Body body: SupplierInput): Supplier

    @PATCH("suppliers/{id}/")
    suspend fun updateSupplier(@Path("id") id: Int, @Body body: SupplierInput): Supplier

    @PATCH("suppliers/{id}/")
    suspend fun deactivateSupplier(@Path("id") id: Int, @Body body: Deactivate = Deactivate()): Supplier

    @DELETE("suppliers/{id}/")
    suspend fun deleteSupplier(@Path("id") id: Int): Response<Unit>

    @GET("products/")
    suspend fun products(
        @Query("include_inactive") includeInactive: Boolean = false,
        @Query("sort") sort: String = "code",
    ): List<Product>

    @GET("products/by-barcode/{code}/")
    suspend fun productByBarcode(@Path("code") code: String): Product

    @POST("products/")
    suspend fun createProduct(@Body body: ProductInput): Product

    @PATCH("products/{id}/")
    suspend fun updateProduct(@Path("id") id: Int, @Body body: ProductInput): Product

    @PATCH("products/{id}/")
    suspend fun deactivateProduct(@Path("id") id: Int, @Body body: Deactivate = Deactivate()): Product

    @DELETE("products/{id}/")
    suspend fun deleteProduct(@Path("id") id: Int): Response<Unit>

    @GET("customers/")
    suspend fun customers(@Query("search") search: String?): List<Customer>

    // ---- Movements ----
    @GET("movements/")
    suspend fun movements(
        @Query("type") type: String? = null,
        @Query("product") productId: Int? = null,
        @Query("from") from: String? = null,
        @Query("to") to: String? = null,
        @Query("limit") limit: Int = 200,
    ): List<Movement>

    @POST("movements/in/")
    suspend fun stockIn(@Body body: StockInRequest): Movement

    // ---- Orders ----
    @GET("orders/")
    suspend fun orders(@Query("status") status: String?, @Query("limit") limit: Int = 300): List<Order>

    @POST("orders/{id}/approve/")
    suspend fun approveOrder(@Path("id") id: Int): Order

    @POST("orders/{id}/reject/")
    suspend fun rejectOrder(@Path("id") id: Int, @Body body: RejectRequest): Order

    @POST("orders/{id}/ship/")
    suspend fun shipOrder(@Path("id") id: Int): Order

    @POST("orders/{id}/cancel/")
    suspend fun cancelOrder(@Path("id") id: Int): Order

    @GET("orders/workload/")
    suspend fun workload(): List<WorkerLoad>

    @POST("orders/rebalance/")
    suspend fun rebalance(): Rebalanced

    // ---- Reports ----
    @GET("dashboard/")
    suspend fun dashboard(): Dashboard

    @GET("reports/restock/")
    suspend fun restock(): List<RestockRow>

    @GET("reports/{name}/")
    suspend fun report(@Path("name") name: String): List<ReportRow>

    @Streaming
    @GET("reports/{name}/export/")
    suspend fun exportReport(@Path("name") name: String, @Query("format") format: String): Response<ResponseBody>

    // ---- Performance ----
    @GET("performance/me/")
    suspend fun myPerformance(@Query("period") period: String): MyPerformance

    @GET("performance/team/{managerId}/")
    suspend fun teamPerformance(@Path("managerId") managerId: Int, @Query("period") period: String): TeamPerformance

    @GET("performance/all/")
    suspend fun allPerformance(@Query("period") period: String): AllPerformance

    @GET("leaderboard/")
    suspend fun leaderboard(@Query("period") period: String): Leaderboard

    // ---- Admin ----
    @GET("admin/users/")
    suspend fun users(
        @Query("status") status: String? = null,
        @Query("role") role: String? = null,
        @Query("search") search: String? = null,
    ): List<AdminUser>

    @POST("admin/users/{id}/approve/")
    suspend fun approveUser(@Path("id") id: Int, @Body body: ApproveRequest): AdminUser

    @POST("admin/users/{id}/reject/")
    suspend fun rejectUser(@Path("id") id: Int): AdminUser

    @POST("admin/users/{id}/block/")
    suspend fun blockUser(@Path("id") id: Int): AdminUser

    @POST("admin/users/{id}/unblock/")
    suspend fun unblockUser(@Path("id") id: Int): AdminUser

    @PATCH("admin/users/{id}/role/")
    suspend fun changeRole(@Path("id") id: Int, @Body body: ApproveRequest): AdminUser

    @GET("admin/employees/")
    suspend fun employees(@Query("role") role: String? = null): List<Employee>

    @PATCH("admin/employees/{id}/team/")
    suspend fun changeTeam(@Path("id") employeeId: Int, @Body body: TeamChangeRequest): Employee

    @GET("admin/devices/")
    suspend fun devices(@Query("status") status: String? = null): List<StaffDevice>

    @POST("admin/devices/{id}/approve/")
    suspend fun approveDevice(@Path("id") id: Int): StaffDevice

    @POST("admin/devices/{id}/revoke/")
    suspend fun revokeDevice(@Path("id") id: Int): StaffDevice
}
