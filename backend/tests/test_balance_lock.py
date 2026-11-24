"""PostgreSQL itself refuses to change money in any way but the ledger (someone with SQL access as the app user).

Each attack runs raw SQL in its own transaction and must fail with OUR rule's message (not by accident);
the balance stays the same.
"""

import pytest
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError


@pytest.fixture
def money(api):
    """A customer with 5 000 KZT paid by card and one open (unpaid) 7 000 payment."""
    headers = api.customer("rich@mail.kz", money=5000)
    assert api.start_top_up(headers, 7000).status_code == 201
    return headers


def rich(db):
    account = db.execute(text(
        "SELECT a.id, a.balance FROM accounts a JOIN customers c ON c.id = a.customer_id "
        "JOIN users u ON u.id = c.user_id WHERE u.email = 'rich@mail.kz'")).one()
    paid = db.execute(text("SELECT id FROM payments WHERE account_id = :a AND status = 'SUCCEEDED'"),
                      {"a": account.id}).scalar_one()
    pending = db.execute(text("SELECT id FROM payments WHERE account_id = :a AND status = 'PENDING'"),
                         {"a": account.id}).scalar_one()
    return account.id, account.balance, paid, pending


def refused(db, why: str, sql: str, **params):
    with pytest.raises(DBAPIError) as err:
        db.execute(text(sql), params)
    db.rollback()
    assert why in str(err.value), str(err.value)


def balance_of(db, account_id):
    return db.execute(text("SELECT balance FROM accounts WHERE id = :a"), {"a": account_id}).scalar_one()


def test_the_balance_cannot_be_set_directly(db, money):
    account, before, *_ = rich(db)
    refused(db, "only through account_transactions", "UPDATE accounts SET balance = 9999999 WHERE id = :a", a=account)
    refused(db, "only through account_transactions", "UPDATE accounts SET balance = balance + 1")
    assert balance_of(db, account) == before


def test_a_new_account_starts_with_zero(db, api):
    api.customer("fresh@mail.kz", money=0)
    db.execute(text("DELETE FROM accounts WHERE balance = 0 AND id NOT IN "
                    "(SELECT account_id FROM account_transactions) AND id NOT IN (SELECT account_id FROM payments)"))
    db.commit()
    customer = db.execute(text("SELECT c.id FROM customers c JOIN users u ON u.id = c.user_id "
                               "WHERE u.email = 'fresh@mail.kz'")).scalar_one()
    refused(db, "starts with 0", "INSERT INTO accounts (customer_id, balance) VALUES (:c, 500)", c=customer)


def test_the_ledger_is_append_only(db, money):
    account, before, *_ = rich(db)
    refused(db, "append-only", "UPDATE account_transactions SET amount = 999999")
    refused(db, "append-only", "UPDATE account_transactions SET balance_after = 999999")
    refused(db, "append-only", "DELETE FROM account_transactions")
    assert balance_of(db, account) == before


INSERT_TOPUP = ("INSERT INTO account_transactions (account_id, tx_type, amount, balance_after, payment_id) "
                "VALUES (:a, 'TOPUP', :m, 0, :p)")


def test_a_top_up_needs_a_succeeded_payment_of_the_same_amount(db, money):
    account, before, paid, pending = rich(db)
    refused(db, "needs a succeeded payment", INSERT_TOPUP, a=account, m=1_000_000, p=None)  # no payment at all
    refused(db, "needs a succeeded payment", INSERT_TOPUP, a=account, m=7000, p=pending)
    refused(db, "needs a succeeded payment", INSERT_TOPUP, a=account, m=1_000_000, p=paid)
    refused(db, "account_transactions_payment_id_key", INSERT_TOPUP, a=account, m=5000, p=paid)
    assert balance_of(db, account) == before


def test_a_payment_of_another_customer_cannot_be_credited_here(db, api, money):
    other = api.customer("other@mail.kz", money=0)
    api.top_up(other, 9000)
    account, before, *_ = rich(db)
    foreign = db.execute(text("SELECT id FROM payments WHERE amount = 9000")).scalar_one()
    refused(db, "needs a succeeded payment", INSERT_TOPUP, a=account, m=9000, p=foreign)
    assert balance_of(db, account) == before


def test_a_refund_needs_a_payment_of_that_order_and_amount(db, api, team, money):
    order = api.order(team["customer"], [(team["product"]["id"], 2)]).json()  # paid 3 000 by team's customer
    account, before, *_ = rich(db)
    insert = ("INSERT INTO account_transactions (account_id, tx_type, amount, balance_after, order_id) "
              "VALUES (:a, 'REFUND', :m, 0, :o)")
    refused(db, "needs a payment of the same order", insert, a=account, m=3000, o=order["id"])  # not his order
    owner = db.execute(text("SELECT account_id FROM account_transactions WHERE order_id = :o"),
                       {"o": order["id"]}).scalar_one()
    refused(db, "needs a payment of the same order", insert, a=owner, m=1_000_000, o=order["id"])
    assert balance_of(db, account) == before


def test_payments_cannot_be_forged_or_rewritten(db, money):
    account, _, paid, pending = rich(db)
    refused(db, "starts as PENDING", "INSERT INTO payments (account_id, amount, status, expires_at, completed_at) "
                                     "VALUES (:a, 1000000, 'SUCCEEDED', now(), now())", a=account)
    refused(db, "never changes", "UPDATE payments SET amount = 1000000 WHERE id = :p", p=paid)
    refused(db, "never changes", "UPDATE payments SET status = 'FAILED' WHERE id = :p", p=paid)
    refused(db, "never change", "UPDATE payments SET amount = 1000000 WHERE id = :p", p=pending)
    refused(db, "never deleted", "DELETE FROM payments")


def test_the_app_way_still_works_after_the_attacks(db, api, money):
    refused(db, "only through account_transactions", "UPDATE accounts SET balance = 1")
    assert api.top_up(money, 1000)["balance"] == 6000
