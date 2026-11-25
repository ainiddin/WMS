import re
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, PlainSerializer, StringConstraints

# Prices in KZT. Stored as NUMERIC, sent to the browser as a JSON number.
Money = Annotated[Decimal, PlainSerializer(float, return_type=float, when_used="json")]
PriceIn = Annotated[Decimal, Field(ge=0, max_digits=12, decimal_places=2)]

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]


def normalize_phone(value: str) -> str:
    """Kazakhstan number in any common spelling -> "+7 7XX XXX XX XX".

    Accepted: +7 701 111 22 33, 8 (701) 111-22-33, 87011112233, 7011112233.
    """
    digits = re.sub(r"\D", "", value)
    if len(digits) == 11 and digits[0] in "78":
        digits = digits[1:]
    if re.search(r"[^\d\s()+-]", value) or len(digits) != 10 or digits[0] != "7":
        raise ValueError("Phone must be a Kazakhstan number: +7 7XX XXX XX XX")
    return f"+7 {digits[:3]} {digits[3:6]} {digits[6:8]} {digits[8:]}"


Phone = Annotated[str, StringConstraints(strip_whitespace=True, max_length=30), AfterValidator(normalize_phone)]
PASSWORD_MIN_LENGTH = 8
PASSWORD_MAX_LENGTH = 72  # bcrypt uses only the first 72 bytes


def password_problems(password: str) -> list[str]:
    """What a new password still needs (empty = good): 8+ characters, a letter, a digit and a special character
    (@ _ - $ ! # ... anything that is not a letter, a digit or a space). The same rule as the website and the app."""
    problems = []
    if len(password) < PASSWORD_MIN_LENGTH:
        problems.append(f"at least {PASSWORD_MIN_LENGTH} characters")
    if not any(c.isalpha() for c in password):
        problems.append("a letter")
    if not any(c.isdigit() for c in password):
        problems.append("a digit")
    if not any(not c.isalnum() and not c.isspace() for c in password):
        problems.append("a special character (@ _ - $ ...)")
    return problems


def check_new_password(password: str) -> str:
    if len(password) > PASSWORD_MAX_LENGTH:
        raise ValueError(f"The password can have at most {PASSWORD_MAX_LENGTH} characters")
    problems = password_problems(password)
    if problems:
        raise ValueError("The password needs " + ", ".join(problems))
    return password


# A NEW password (sign up, invitation, change). Signing in with an old, weaker password still works.
Password = Annotated[str, AfterValidator(check_new_password)]

Period = Literal["week", "month", "quarter", "year"]


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class Message(BaseModel):
    detail: str
