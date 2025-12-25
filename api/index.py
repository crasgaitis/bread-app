from flask import Flask, request, jsonify

app = Flask(__name__)

@app.route("/api/ping")
def ping():
    return jsonify({"status": "alive"})

@app.route("/api/save", methods=["POST"])
def save():
    data = request.json
    return jsonify({"ok": True})
