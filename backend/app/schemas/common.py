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
Password = Annotated[str, StringConstraints(min_length=8, max_length=72)]

Period = Literal["week", "month", "quarter", "year"]


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class Message(BaseModel):
    detail: str
