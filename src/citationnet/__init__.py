"""Flask app for citationnet."""
import contextlib
import json
import os
import secrets
from datetime import timedelta
from pathlib import Path

import flask
import requests
from flask import Flask, flash, redirect, render_template, request, session, url_for
from semanticlayertools.visual.citationnet import GenerateTree

mainpath = Path(__file__).parent.resolve()
datapath = Path(mainpath / "media" / "data")


def create_app() -> flask.app.Flask:
    """Create flask app."""
    app = Flask(
        "citationnet",
        template_folder=f"{mainpath}/templates",
        static_url_path="/static",
        static_folder="static",
        root_path=mainpath,
    )
    app.secret_key = secrets.token_bytes(12)
    app.config["PERMANENT_SESSION_LIFETIME"] = timedelta(days=2)

    # ensure the instance folder exists
    # with contextlib.suppress(OSError):
    #    Path.mkdir(app.instance_path, parents=True)

    @app.route("/", methods=["GET"])
    def startpage() -> None:
        files = [x for x in os.listdir(datapath) if x.endswith(".json")]
        return render_template("startpage.html", availablefiles=files)

    @app.route("/generatedata/", methods=["POST"])
    async def generatedata() -> None:
        session.permanent = True
        apitoken = request.form.get("inputToken")
        doivalue = request.form.get("doiInput").strip()
        citationlimit = int(request.form.get("citationlimit"))
        error = 404
        if not doivalue:
            flash("Please enter a DOI.", "warning")
            return redirect(url_for("startpage"))
        res = requests.get(f"https://doi.org/{doivalue}")
        if res.status_code == error:
            flash("Please provide a valid DOI.", "danger")
            return redirect(url_for("startpage"))
        if session.get("TOKEN"):
            apitoken = session["TOKEN"]
        tree = GenerateTree(api_key=apitoken)
        if tree.status == "Error":
            flash(
                "Can not initialize data generation. Did you provide the correct API token?",
                "danger",
            )
            return redirect(url_for("startpage"))
        if not session.get("TOKEN"):
            session["TOKEN"] = apitoken
        retvalue = tree.query(doivalue, citationLimit=citationlimit)
        if isinstance(retvalue, str):
            flash(retvalue, "warning")
            return redirect(url_for("startpage"))
        time, filename = tree.generateNetworkFiles(datapath)
        flash(f"Generated new data {filename} in {time} seconds.", "success")
        return redirect(url_for("citnet", filename=filename))

    @app.route("/citationnet/", methods=["POST", "GET"])
    @app.route("/citationnet/<filename>/", methods=["POST", "GET"])
    def citnet(filename: str) -> None:
        session.permanent = True
        files = [x for x in os.listdir(datapath) if x.endswith(".json")]
        if request.method == "POST":
            filename = request.form.get("filename")
        if filename is None:
            flash("No filename provided.", "danger")
            return redirect(url_for("startpage", availablefiles=files))
        if not Path.is_file(f"{Path(datapath / filename)}"):
            flash(f"No file found at {Path(datapath / filename)}", "danger")
            return redirect(url_for("startpage", availablefiles=files))
        with Path.open(f"{Path(datapath / filename)}") as jsonfile:
            data = json.load(jsonfile)
        return render_template("visDynamic.html", jsondata=data, availablefiles=files)

    return app
