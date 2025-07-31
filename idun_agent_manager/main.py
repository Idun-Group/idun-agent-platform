from fastapi import FastAPI
from idun_agent_manager.api.api import api_router
from idun_agent_manager.db import sqlite_db
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="Idun Agent Manager",
    description="A manager for creating, running, and interacting with various AI agents.",
    version="0.1.0",
)

origins = [
    "http://localhost",
    "http://localhost:3000",
    "http://localhost:8080",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def on_startup():
    """Initialize the database when the application starts."""
    print("Initializing database...")
    sqlite_db.initialize_db()
    print("Database initialized.")

app.include_router(api_router, prefix="/api/v1")

@app.get("/")
def read_root():
    return {"message": "Welcome to the Idun Agent Manager API"}

# To run this application (from the project root directory):
# poetry run uvicorn idun_agent_manager.main:app --reload 