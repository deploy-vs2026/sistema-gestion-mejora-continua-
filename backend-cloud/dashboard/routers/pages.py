from fastapi import APIRouter
from fastapi.responses import FileResponse

from dashboard.config import FULL_TABLE
from dashboard.database import client

router = APIRouter()


@router.get("/hd")
def hd_page():
    return FileResponse("grafico_semanal.html")


@router.get("/falabella-dashboard")
def falabella_page():
    return FileResponse("grafico_semanal.html")


@router.get("/semanal")
def semanal():
    return FileResponse("grafico_semanal.html")


@router.get("/kpi-operacion")
def kpi_operacion_page():
    return FileResponse("grafico_semanal.html")
