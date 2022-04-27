import os
from datetime import timedelta
import secrets
import json
from flask import Flask, render_template, request, flash, session, url_for, redirect
import requests
from semanticlayertools.visual.citationnet import GenerateTree

mainpath = os.path.dirname(os.path.abspath(__file__))
datapath = os.path.join(mainpath, 'media', 'data')


def create_app(test_config=None):
    app = Flask(
        "citationnet",
        template_folder=f'{mainpath}/templates',
        static_url_path="/static",
        static_folder='static',
        root_path=mainpath
    )
    app.secret_key = secrets.token_bytes(12)
    app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(days=2)

    # ensure the instance folder exists
    try:
        os.makedirs(app.instance_path)
    except OSError:
        pass

    @app.route('/', methods=['GET'])
    def startpage():
        files = [x for x in os.listdir(datapath) if x.endswith('.json')]
        return render_template('startpage.html', availablefiles=files)

    @app.route('/generatedata/', methods=['POST'])
    async def generatedata():
        session.permanent = True
        apitoken = request.form.get('inputToken')
        doivalue = request.form.get('doiInput').strip()
        citationlimit = int(request.form.get("citationlimit"))
        if not doivalue:
            flash("Please enter a DOI.", "warning")
            return redirect(url_for("startpage"))
        res = requests.get(f'https://doi.org/{doivalue}')
        if res.status_code == 404:
            flash("Please provide a valid DOI.", "danger")
            return redirect(url_for("startpage"))
        if session.get('TOKEN'):
            apitoken = session['TOKEN']
        tree = GenerateTree(api_key=apitoken)
        if tree.status == 'Error':
            flash("Can not initialize data generation. Did you provide the correct API token?", "danger")
            return redirect(url_for("startpage"))
        if not session.get('TOKEN'):
            session['TOKEN'] = apitoken
        retvalue = tree.query(doivalue, citationLimit=citationlimit)
        if isinstance(retvalue, str):
            flash(retvalue, 'warning')
            return redirect(url_for("startpage"))
        time, filename = tree.generateNetworkFiles(datapath)
        flash(f"Generated new data {filename} in {time} seconds.", "success")
        return redirect(url_for("citnet", filename=filename))

    @app.route('/citationnet/', methods=['POST', 'GET'])
    @app.route('/citationnet/<filename>/', methods=['POST', 'GET'])
    def citnet(filename=None):
        session.permanent = True
        files = [x for x in os.listdir(datapath) if x.endswith('.json')]
        if request.method == 'POST':
            filename = request.form.get('filename')
        if filename is None:
            flash("No filename provided.", "danger")
            return redirect(url_for('startpage', availablefiles=files))
        if not os.path.isfile(f'{os.path.join(datapath, filename)}'):
            flash(f'No file found at {os.path.join(datapath, filename)}', 'danger')
            return redirect(url_for("startpage", availablefiles=files))
        with open(f'{os.path.join(datapath, filename)}', 'r') as jsonfile:
            data = json.load(jsonfile)
        return render_template('visDynamic.html', jsondata=data, availablefiles=files)

    return app
