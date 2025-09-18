#!/bin/bash
uv venv
uv pip install -r requirements.txt
source .venv/bin/activate
jupyter lab