"""Who sees what (checked here, on the server):
  Admin   -> all teams, all Managers, all Workers
  Manager -> himself + Workers whose manager_id = him
  Worker  -> only himself (another id in the URL gives 403)
"""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.deps import DB, CurrentEmployee
from app.models import Employee, Role
from app.schemas.common import Period
from app.services import performance_service

router = APIRouter(prefix="/api", tags=["performance"])


def _admin(employee: CurrentEmployee) -> Employee:
    if employee.role != Role.ADMIN:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only Admin can see all teams")
    return employee


def _team_manager(db: DB, manager_id: int, viewer: CurrentEmployee) -> Employee:
    """Returns the team's Manager if the viewer may see this team, otherwise 403/404."""
    if viewer.role == Role.WORKER:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Workers can see only their own numbers")
    if viewer.role == Role.MANAGER and viewer.id != manager_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You can see only your own team")
    manager = db.get(Employee, manager_id)
    if manager is None or manager.role != Role.MANAGER:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Team not found")
    return manager


TeamManager = Annotated[Employee, Depends(_team_manager)]


@router.get("/performance/me/")
def my_performance(db: DB, employee: CurrentEmployee, period: Period = "month"):
    """Own numbers + chart + the team's place in the leaderboard."""
    return performance_service.my_performance(db, employee, period)


@router.get("/performance/team/{manager_id}/")
def team_performance(db: DB, manager: TeamManager, period: Period = "month"):
    return performance_service.team_performance(db, manager, period)


@router.get("/performance/all/")
def all_performance(db: DB, _: Annotated[Employee, Depends(_admin)], period: Period = "month"):
    return performance_service.all_performance(db, period)


@router.get("/leaderboard/")
def leaderboard(db: DB, _: CurrentEmployee, period: Period = "month"):
    """Team ranking, visible to every employee."""
    board = performance_service.leaderboard(db, period)
    return performance_service.period_info(period) | {
        "points_formula": "orders shipped x 10 + orders approved x 2 + stock IN x 1",
        "teams": [t.to_dict() for t in board],
    }


@router.get("/leaderboard/team/{manager_id}/")
def team_leaderboard(db: DB, manager: TeamManager, period: Period = "month"):
    """Workers ranking inside one team: its Manager and Admin only."""
    return performance_service.period_info(period) | {
        "team_name": manager.team_name,
        "workers": performance_service.ranked_workers(db, manager, period),
    }
