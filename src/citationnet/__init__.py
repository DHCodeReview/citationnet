import os
import json
from flask import Flask, render_template
mainpath = os.path.dirname(os.path.abspath(__file__))

datapath = os.path.join(mainpath, 'media', 'data')


def create_app(test_config=None):
    # create and configure the app
    app = Flask(
        "citationnet",
        # instance_relative_config=True,
        template_folder=f'{mainpath}/templates',
        static_url_path="/static",
        static_folder='static',
        root_path=mainpath
    )
    # app.config.from_mapping(
    #     SECRET_KEY='dev',
    #     DATABASE=os.path.join(app.instance_path, 'citationnet.sqlite'),
    # )

    if test_config is None:
        # load the instance config, if it exists, when not testing
        app.config.from_pyfile('config.py', silent=True)
    else:
        # load the test config if passed in
        app.config.from_mapping(test_config)

    # ensure the instance folder exists
    try:
        os.makedirs(app.instance_path)
    except OSError:
        pass

    # a simple page that says hello
    @app.route('/')
    def hello():
        return 'Startpage!'

    @app.route('/citationnet/')
    @app.route('/citationnet/<name>')
    def citnet(name=None):
        if name is None:
            return render_template('404.html')
        else:
            try:
                with open(f'{os.path.join(datapath, name)}', 'r') as jsonfile:
                    data = json.load(jsonfile)
                return render_template('visDynamic.html', jsondata=data)
            except Exception as e:
                raise e

    @app.route('/simple/')
    def simple():
        data = {"name": "Malte", "city": "Berlin"}
        return render_template('testing.html', jsondata=data)

    @app.route('/testjson/')
    @app.route('/testjson/<name>')
    def testjson(name=None):
        with open(f'{os.path.join(datapath, name)}') as jsonfile:
            data = json.load(jsonfile)
        return render_template('testing.html', jsondata=data)

    return app
