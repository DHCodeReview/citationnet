"""Test citationnet python part."""
import citationnet
import pytest


@pytest.fixture()
def client():
    app = citationnet.create_app()
    app.config["TESTING"] = True
    with app.test_client() as client:
        yield client


def test_returnvalue(client):
    """Start with a blank database."""
    rv = client.get("/")
    assert rv.status_code == 200
