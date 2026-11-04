from sqlalchemy import CheckConstraint, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base
from app.models.common import code_column
from app.models.user import User


class Employee(Base):
    """Staff member (Admin, Manager or Worker). A team = one Manager + the Workers whose manager_id points to him."""

    __tablename__ = "employees"
    __table_args__ = (
        CheckConstraint("role IN ('ADMIN', 'MANAGER', 'WORKER')", name="chk_employees_role"),
        # Rule 9: a Worker always belongs to a Manager; Managers and Admins have no manager.
        CheckConstraint(
            "(role = 'WORKER' AND manager_id IS NOT NULL) OR (role <> 'WORKER' AND manager_id IS NULL)",
            name="chk_employees_manager",
        ),
        CheckConstraint("manager_id IS NULL OR manager_id <> id", name="chk_employees_not_own_manager"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = code_column("E", 3)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), unique=True)
    full_name: Mapped[str] = mapped_column(String(100))
    role: Mapped[str] = mapped_column(String(10))
    phone: Mapped[str | None] = mapped_column(String(30))
    manager_id: Mapped[int | None] = mapped_column(ForeignKey("employees.id", ondelete="RESTRICT"), index=True)
    is_active: Mapped[bool] = mapped_column(default=True, server_default="true")

    user: Mapped[User] = relationship(back_populates="employee")
    manager: Mapped["Employee | None"] = relationship(remote_side=[id], back_populates="workers")
    workers: Mapped[list["Employee"]] = relationship(back_populates="manager")

    @property
    def team_name(self) -> str:
        return f"Team {self.full_name.split()[0]}"


class Customer(Base):
    """Private buyer. Created at sign up; the email lives in USERS."""

    __tablename__ = "customers"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = code_column("C", 3)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), unique=True)
    full_name: Mapped[str] = mapped_column(String(100))
    phone: Mapped[str | None] = mapped_column(String(30))
    address: Mapped[str | None] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(default=True, server_default="true")

    user: Mapped[User | None] = relationship(back_populates="customer")

    @property
    def email(self) -> str | None:
        return self.user.email if self.user else None
