import os
import json
from flask import Flask, render_template, request

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

    if test_config is None:
        app.config.from_pyfile('config.py', silent=True)
    else:
        # load the test config if passed in
        app.config.from_mapping(test_config)

    # ensure the instance folder exists
    try:
        os.makedirs(app.instance_path)
    except OSError:
        pass

    @app.route('/', methods=['POST', 'GET'])
    def startpage():
        if request.method == "GET":
            files = [x for x in os.listdir(datapath) if x.endswith('.json')]
            return render_template('startpage.html', availablefiles=files)
        elif request.method == "POST":
            apitoken = request.args.get('token')
            doivalue = request.args.get('doistring')
            tree = GenerateTree(api_key=apitoken)
            time, filename = tree.query(doivalue).generateNetworkFiles(datapath)
            files = [x for x in os.listdir(datapath) if x.endswith('.json')]
            return render_template(
                'startpage.html',
                availablefiles=files,
                duration=time,
                filename=filename
            )

    @app.route('/citationnet/', methods=['POST', 'GET'])
    def citnet(filename=None):
        filename = request.args.get('filename')
        files = [x for x in os.listdir(datapath) if x.endswith('.json')]
        if filename is None:
            return render_template('404.html')
        else:
            try:
                with open(f'{os.path.join(datapath, filename)}', 'r') as jsonfile:
                    data = json.load(jsonfile)
                return render_template('visDynamic.html', jsondata=data, availablefiles=files)
            except Exception as e:
                raise e

    return app
