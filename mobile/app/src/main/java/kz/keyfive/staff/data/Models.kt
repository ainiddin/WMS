package kz.keyfive.staff.data

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

// Types of the FastAPI responses (backend/app/schemas). Only the fields the app uses are listed.

@Serializable
data class User(
    val id: Int,
    val email: String,
    @SerialName("full_name") val fullName: String,
    val phone: String? = null,
    val role: String,
    val status: String,
    @SerialName("employee_id") val employeeId: Int? = null,
    @SerialName("employee_code") val employeeCode: String? = null,
    @SerialName("manager_id") val managerId: Int? = null,
)

@Serializable
data class TokenPair(
    @SerialName("access_token") val accessToken: String,
    @SerialName("refresh_token") val refreshToken: String,
    val user: User,
)

@Serializable
data class StaffLoginRequest(
    val email: String,
    val password: String,
    @SerialName("device_secret") val deviceSecret: String,
    @SerialName("device_name") val deviceName: String,
)

@Serializable
data class RefreshRequest(@SerialName("refresh_token") val refreshToken: String)

@Serializable
data class SendCodeRequest(val email: String)

@Serializable
data class StaffRegisterRequest(
    val email: String,
    val code: String,
    val password: String,
    @SerialName("full_name") val fullName: String,
    val phone: String? = null,
    @SerialName("requested_role") val requestedRole: String,
)

@Serializable
data class Detail(val detail: String)

// ---- Catalog ----
@Serializable
data class Category(val id: Int, val code: String, val name: String, @SerialName("is_active") val isActive: Boolean)

@Serializable
data class CategoryInput(val name: String, @SerialName("is_active") val isActive: Boolean)

@Serializable
data class Supplier(
    val id: Int,
    val code: String,
    @SerialName("supplier_name") val supplierName: String,
    val phone: String,
    val email: String? = null,
    @SerialName("is_active") val isActive: Boolean,
)

@Serializable
data class SupplierInput(
    @SerialName("supplier_name") val supplierName: String,
    val phone: String,
    val email: String?,
    @SerialName("is_active") val isActive: Boolean,
)

@Serializable
data class SupplierShort(val id: Int, val code: String, @SerialName("supplier_name") val supplierName: String)

@Serializable
data class Product(
    val id: Int,
    val code: String,
    @SerialName("product_name") val name: String,
    val description: String? = null,
    val category: Category,
    @SerialName("unit_price") val unitPrice: Double,
    @SerialName("is_active") val isActive: Boolean,
    val quantity: Int = 0,
    @SerialName("min_quantity") val minQuantity: Int = 0,
    @SerialName("below_min") val belowMin: Boolean = false,
    val barcode: String? = null,
    @SerialName("last_updated") val lastUpdated: String? = null,
    val supplier: SupplierShort? = null,
)

@Serializable
data class ProductInput(
    @SerialName("product_name") val name: String,
    val description: String?,
    @SerialName("category_id") val categoryId: Int,
    @SerialName("supplier_id") val supplierId: Int,
    @SerialName("unit_price") val unitPrice: Double,
    @SerialName("min_quantity") val minQuantity: Int,
    val barcode: String?,
    @SerialName("is_active") val isActive: Boolean,
)

@Serializable
data class Deactivate(@SerialName("is_active") val isActive: Boolean = false)

@Serializable
data class Customer(
    val id: Int,
    val code: String,
    @SerialName("full_name") val fullName: String,
    val phone: String? = null,
    val address: String? = null,
    val email: String? = null,
    @SerialName("is_active") val isActive: Boolean,
    val balance: Double = 0.0,
)

// ---- Movements ----
@Serializable
data class Movement(
    val id: Int,
    val code: String,
    @SerialName("movement_type") val type: String,
    val quantity: Int,
    @SerialName("movement_time") val time: String,
    val note: String? = null,
    @SerialName("product_code") val productCode: String,
    @SerialName("product_name") val productName: String,
    @SerialName("employee_name") val employeeName: String,
    @SerialName("customer_name") val customerName: String? = null,
    @SerialName("order_code") val orderCode: String? = null,
)

@Serializable
data class StockInRequest(
    @SerialName("product_id") val productId: Int,
    val quantity: Int,
    val note: String? = null,
)

// ---- Orders ----
@Serializable
data class PersonShort(val id: Int, val code: String, @SerialName("full_name") val fullName: String)

@Serializable
data class OrderItem(
    val id: Int,
    @SerialName("product_id") val productId: Int,
    @SerialName("product_code") val productCode: String,
    @SerialName("product_name") val productName: String,
    val barcode: String? = null,
    val quantity: Int,
    @SerialName("unit_price") val unitPrice: Double,
    @SerialName("line_total") val lineTotal: Double,
    @SerialName("available_quantity") val available: Int? = null,
)

@Serializable
data class WaitingLine(
    @SerialName("product_name") val productName: String,
    val missing: Int,
)

@Serializable
data class Order(
    val id: Int,
    val code: String,
    val status: String,
    @SerialName("delivery_address") val deliveryAddress: String,
    @SerialName("total_amount") val total: Double,
    @SerialName("payment_status") val paymentStatus: String? = null,
    val comment: String? = null,
    @SerialName("rejection_reason") val rejectionReason: String? = null,
    @SerialName("created_at") val createdAt: String,
    @SerialName("approved_at") val approvedAt: String? = null,
    @SerialName("shipped_at") val shippedAt: String? = null,
    val customer: PersonShort,
    @SerialName("approved_by") val approvedBy: PersonShort? = null,
    @SerialName("shipped_by") val shippedBy: PersonShort? = null,
    @SerialName("assigned_to") val assignedTo: PersonShort? = null,
    val items: List<OrderItem>,
    val waiting: List<WaitingLine>? = null,
    @SerialName("eta_min_days") val etaMin: Int? = null,
    @SerialName("eta_max_days") val etaMax: Int? = null,
)

@Serializable
data class RejectRequest(val reason: String?)

@Serializable
data class WorkerLoad(
    val worker: PersonShort,
    @SerialName("team_name") val teamName: String,
    @SerialName("open_orders") val openOrders: Int,
    @SerialName("open_units") val openUnits: Int,
)

@Serializable
data class Rebalanced(val moved: Int)

// ---- Reports ----
@Serializable
data class RestockRow(
    @SerialName("product_id") val productId: Int,
    @SerialName("product_code") val productCode: String,
    @SerialName("product_name") val productName: String,
    val quantity: Int,
    @SerialName("min_quantity") val minQuantity: Int,
    val shortage: Int,
    @SerialName("supplier_name") val supplierName: String,
    @SerialName("supplier_phone") val supplierPhone: String,
    @SerialName("supplier_email") val supplierEmail: String? = null,
)

@Serializable
data class DashboardCards(
    @SerialName("products_active") val productsActive: Int,
    @SerialName("products_below_min") val productsBelowMin: Int,
    @SerialName("products_out_of_stock") val productsOutOfStock: Int,
    @SerialName("orders_pending") val ordersPending: Int,
    @SerialName("orders_to_ship") val ordersToShip: Int,
    @SerialName("orders_shipped_month") val ordersShippedMonth: Int,
    @SerialName("revenue_month") val revenueMonth: Double,
    @SerialName("stock_value") val stockValue: Double,
)

@Serializable
data class SalesMonth(val month: String, val orders: Int, val revenue: Double)

@Serializable
data class MovementMonth(val month: String, @SerialName("in") val unitsIn: Int, val out: Int)

@Serializable
data class CategorySales(val category: String, val revenue: Double, val units: Int)

@Serializable
data class TopCustomer(
    @SerialName("full_name") val fullName: String,
    @SerialName("orders_shipped") val ordersShipped: Int,
    @SerialName("total_amount") val total: Double,
)

@Serializable
data class Dashboard(
    val cards: DashboardCards,
    @SerialName("movements_by_month") val movementsByMonth: List<MovementMonth>,
    @SerialName("sales_by_month") val salesByMonth: List<SalesMonth>,
    @SerialName("sales_by_category") val salesByCategory: List<CategorySales>,
    @SerialName("top_customers") val topCustomers: List<TopCustomer>,
    val restock: List<RestockRow>,
)

typealias ReportRow = JsonObject

// ---- Performance ----
@Serializable
data class Metrics(
    @SerialName("employee_id") val employeeId: Int,
    val code: String,
    @SerialName("full_name") val fullName: String,
    val role: String,
    @SerialName("orders_approved") val ordersApproved: Int,
    @SerialName("orders_rejected") val ordersRejected: Int,
    @SerialName("avg_approval_hours") val avgApprovalHours: Double? = null,
    @SerialName("orders_shipped") val ordersShipped: Int,
    @SerialName("units_shipped") val unitsShipped: Int,
    @SerialName("stock_in_count") val stockInCount: Int,
    @SerialName("units_in") val unitsIn: Int,
    val points: Int,
    val rank: Int? = null,
)

@Serializable
data class TeamSummary(
    @SerialName("manager_id") val managerId: Int,
    @SerialName("manager_name") val managerName: String,
    @SerialName("team_name") val teamName: String,
    val members: Int,
    @SerialName("orders_shipped") val ordersShipped: Int,
    @SerialName("orders_approved") val ordersApproved: Int,
    @SerialName("stock_in_count") val stockInCount: Int,
    @SerialName("units_shipped") val unitsShipped: Int,
    val points: Int,
    val rank: Int,
)

@Serializable
data class TimelinePoint(val date: String, val points: Int, @SerialName("orders_shipped") val ordersShipped: Int)

@Serializable
data class MyPerformance(
    val start: String,
    val end: String,
    val me: Metrics,
    val timeline: List<TimelinePoint>,
    val team: TeamSummary? = null,
    @SerialName("rank_in_team") val rankInTeam: Int? = null,
    @SerialName("team_size") val teamSize: Int? = null,
)

@Serializable
data class TeamPerformance(
    val start: String,
    val end: String,
    val team: TeamSummary? = null,
    val manager: Metrics,
    val workers: List<Metrics>,
    val timeline: List<TimelinePoint>,
)

@Serializable
data class Totals(
    @SerialName("orders_shipped") val ordersShipped: Int,
    @SerialName("orders_approved") val ordersApproved: Int,
    @SerialName("stock_in_count") val stockInCount: Int,
    @SerialName("units_shipped") val unitsShipped: Int,
    val points: Int,
)

@Serializable
data class AllPerformance(
    val start: String,
    val end: String,
    val totals: Totals,
    val teams: List<TeamSummary>,
    val timeline: List<TimelinePoint>,
)

@Serializable
data class Leaderboard(
    val start: String,
    val end: String,
    @SerialName("points_formula") val pointsFormula: String,
    val teams: List<TeamSummary>,
)

// ---- Admin ----
@Serializable
data class Employee(
    val id: Int,
    val code: String,
    @SerialName("full_name") val fullName: String,
    val role: String,
    @SerialName("manager_id") val managerId: Int? = null,
    @SerialName("team_name") val teamName: String,
    @SerialName("is_active") val isActive: Boolean,
)

@Serializable
data class AdminUser(
    val id: Int,
    val email: String,
    @SerialName("full_name") val fullName: String,
    val phone: String? = null,
    val role: String,
    val status: String,
    @SerialName("requested_role") val requestedRole: String? = null,
    @SerialName("created_at") val createdAt: String,
    val employee: Employee? = null,
)

@Serializable
data class ApproveRequest(val role: String, @SerialName("manager_id") val managerId: Int?)

@Serializable
data class TeamChangeRequest(@SerialName("manager_id") val managerId: Int)

@Serializable
data class StaffDevice(
    val id: Int,
    @SerialName("device_name") val deviceName: String,
    val status: String,
    @SerialName("created_at") val createdAt: String,
    @SerialName("last_seen_at") val lastSeenAt: String? = null,
    @SerialName("user_email") val userEmail: String,
    @SerialName("user_full_name") val userFullName: String,
    @SerialName("user_role") val userRole: String,
    val current: Boolean = false,
)
