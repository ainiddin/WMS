from decimal import Decimal
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, PlainSerializer, StringConstraints

# Prices in KZT. Stored as NUMERIC, sent to the browser as a JSON number.
Money = Annotated[Decimal, PlainSerializer(float, return_type=float, when_used="json")]
PriceIn = Annotated[Decimal, Field(ge=0, max_digits=12, decimal_places=2)]

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
Phone = Annotated[str, StringConstraints(strip_whitespace=True, min_length=5, max_length=30)]
Password = Annotated[str, StringConstraints(min_length=8, max_length=72)]

Period = Literal["week", "month", "quarter", "year"]


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class Message(BaseModel):
    detail: str
