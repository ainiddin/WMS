"""CardPay Fake: a pretend card payment gateway for the demo. No real money, nothing is stored.

It plays the role of an external provider and is kept apart from the shop on purpose:
- it imports nothing from the shop (only settings for its secret);
- the shop sends the customer to its page with a signed link (`signing.sign_link`);
- the customer types the card on that page only; the shop API never sees the card;
- the result reaches the shop as a signed webhook (`signing.sign_event`), which the shop verifies.

Swapping it for a real gateway means a new adapter in the shop, not changes in the shop's rules.
"""
