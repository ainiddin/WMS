"""Card checks of CardPay Fake. The card is checked and forgotten: nothing here is stored or logged.

Test cards decide the result (like the test cards of real gateways):
- 4000 0000 0000 0002 -> declined;
- 4000 0000 0000 9995 -> not enough money on the card;
- any other valid card -> paid.
"""

from datetime import date

DECLINED = {
    "4000000000000002": "The bank declined the card",
    "4000000000009995": "Not enough money on the card",
}


def digits(value: str) -> str:
    return "".join(value.split()).replace("-", "")


def luhn_ok(number: str) -> bool:
    """The check digit every real card number has; catches typos."""
    total = 0
    for i, ch in enumerate(reversed(number)):
        d = int(ch)
        if i % 2:
            d = d * 2 - 9 if d > 4 else d * 2
        total += d
    return total % 10 == 0


def brand(number: str) -> str:
    if number.startswith("4"):
        return "Visa"
    if 51 <= int(number[:2]) <= 55 or 2221 <= int(number[:4]) <= 2720:
        return "Mastercard"
    if number[:2] in ("34", "37"):
        return "American Express"
    if 2200 <= int(number[:4]) <= 2204:
        return "Mir"
    if number.startswith("62"):
        return "UnionPay"
    return "Card"


def problems(holder: str, number: str, exp_month: int, exp_year: int, cvc: str, today: date) -> list[str]:
    """What is wrong with the typed card, in words for the payment page. Empty = the card can be charged."""
    out = []
    if len(" ".join(holder.split())) < 2:
        out.append("Enter the name as written on the card")
    if not number.isdigit() or not 13 <= len(number) <= 19:
        out.append("A card number has 13 to 19 digits")
    elif not luhn_ok(number):
        out.append("The card number is wrong, check the digits")
    if not 1 <= exp_month <= 12:
        out.append("The month is 01 to 12")
    elif (exp_year, exp_month) < (today.year, today.month):
        out.append("The card has expired")
    if not cvc.isdigit() or len(cvc) not in (3, 4):
        out.append("CVC is 3 or 4 digits")
    return out


def decline_reason(number: str) -> str | None:
    return DECLINED.get(number)
