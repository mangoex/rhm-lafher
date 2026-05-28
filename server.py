import http.server
import socketserver
import json
import os
import openpyxl
import urllib.parse
from datetime import datetime

PORT = 8000
DIRECTORY = r"c:\Users\Miguel Gonzalez\Downloads\RHM"
EXCEL_PATH = os.path.join(DIRECTORY, "Nomina ciega.xlsx")

class APIHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        # Serve static files from DIRECTORY
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def do_OPTIONS(self):
        # CORS preflight headers
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def send_json(self, data, status=200):
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode("utf-8"))

    def do_GET(self):
        # API Routes
        if self.path == "/api/employees":
            self.get_employees()
        else:
            # Fallback to standard static file server
            super().do_GET()

    def do_POST(self):
        # Read JSON body
        content_length = int(self.headers.get('Content-Length', 0))
        post_data = self.rfile.read(content_length) if content_length > 0 else b""
        
        try:
            body = json.loads(post_data.decode("utf-8")) if post_data else {}
        except Exception as e:
            self.send_json({"error": f"Invalid JSON: {e}"}, 400)
            return

        if self.path == "/api/collaborator":
            self.save_collaborator(body)
        elif self.path == "/api/incidences":
            self.save_incidences(body)
        elif self.path == "/api/config":
            self.save_config(body)
        else:
            self.send_json({"error": "Endpoint not found"}, 404)

    # --- API ENDPOINTS LOGIC ---

    def get_employees(self):
        try:
            if not os.path.exists(EXCEL_PATH):
                self.send_json({"error": f"Excel database file not found at {EXCEL_PATH}"}, 500)
                return

            # Open spreadsheet (data_only=True to get raw values, data_only=False to get formulas)
            wb_v = openpyxl.load_workbook(EXCEL_PATH, data_only=True)
            wb_f = openpyxl.load_workbook(EXCEL_PATH, data_only=False)
            
            sheet_v = wb_v.active
            sheet_f = wb_f.active

            # 1. Read global UMA
            uma = sheet_v.cell(row=2, column=19).value # Cell S2
            try:
                uma = float(str(uma).replace(",", "").strip()) if uma is not None else 117.31
            except:
                uma = 117.31

            # 2. Iterate and read employees starting from row 6
            employees = []
            row = 6
            while True:
                # Check if row is empty or a total row
                nombre_val = sheet_v.cell(row=row, column=4).value # Column D
                cod_val = sheet_v.cell(row=row, column=2).value # Column B
                
                # Stop if we hit a total row or empty row
                if nombre_val and any(x in str(nombre_val).upper() for x in ["TOTAL", "SUMA"]):
                    break
                if nombre_val is None and cod_val is None:
                    # Let's check next 3 rows to see if we reached end
                    has_more = False
                    for i in range(1, 4):
                        n = sheet_v.cell(row=row+i, column=4).value
                        c = sheet_v.cell(row=row+i, column=2).value
                        if n or c:
                            has_more = True
                    if not has_more:
                        break
                
                if nombre_val:
                    # Extract date values
                    ingreso = sheet_v.cell(row=row, column=9).value # Column I
                    if isinstance(ingreso, datetime):
                        ingreso_str = ingreso.strftime("%Y-%m-%d")
                    else:
                        ingreso_str = str(ingreso)[:10] if ingreso else ""
                        
                    baja = sheet_v.cell(row=row, column=11).value # Column K
                    if isinstance(baja, datetime):
                        baja_str = baja.strftime("%Y-%m-%d")
                    else:
                        baja_str = str(baja)[:10] if baja else None

                    # Parse float helper
                    def val_to_float(cell_val):
                        if cell_val is None:
                            return 0.0
                        v = str(cell_val).replace(",", "").strip()
                        if v == "-" or v == "" or v == "None":
                            return 0.0
                        try:
                            return float(v)
                        except ValueError:
                            return 0.0

                    # Parse incidences from AG formula
                    formula_ag = sheet_f.cell(row=row, column=33).value # Column AG
                    faltas = 0
                    if isinstance(formula_ag, str) and "/15*" in formula_ag:
                        try:
                            # Formula form: =AF{row}/2/15*worked_days
                            parts = formula_ag.split("*")
                            days_worked = int(parts[-1])
                            faltas = 15 - days_worked
                        except:
                            pass

                    # Clean code ID
                    cod_id = str(cod_val).strip() if cod_val is not None else f"TEMP_{row}"

                    emp = {
                        "id": cod_id,
                        "_row": row,
                        "no": str(sheet_v.cell(row=row, column=1).value or ""),
                        "nombre": str(nombre_val).strip(),
                        "empresa": str(sheet_v.cell(row=row, column=3).value or "").strip(),
                        "area": str(sheet_v.cell(row=row, column=5).value or "").strip(),
                        "depto": str(sheet_v.cell(row=row, column=6).value or "").strip(),
                        "puesto": str(sheet_v.cell(row=row, column=7).value or "").strip(),
                        "lugar": str(sheet_v.cell(row=row, column=8).value or "").strip(),
                        "ingreso": ingreso_str,
                        "baja": baja_str,
                        "fondo_ahorro_activo": str(sheet_v.cell(row=row, column=12).value or "").upper() == "SI",
                        
                        # Payment settings
                        "salario_diario": val_to_float(sheet_v.cell(row=row, column=13).value),
                        "asimilados": val_to_float(sheet_v.cell(row=row, column=22).value),
                        "gasolina": val_to_float(sheet_v.cell(row=row, column=23).value),
                        "socio": val_to_float(sheet_v.cell(row=row, column=24).value),
                        "efectivo": val_to_float(sheet_v.cell(row=row, column=25).value),
                        "facturado": val_to_float(sheet_v.cell(row=row, column=26).value),
                        "deuda_carro": val_to_float(sheet_v.cell(row=row, column=27).value),
                        
                        # Current period status (written in spreadsheet)
                        "descuento_adicional": val_to_float(sheet_v.cell(row=row, column=31).value), # Column AE
                        "observaciones": str(sheet_v.cell(row=row, column=34).value or "").strip(), # Column AH
                        "faltas": faltas,
                        "vacaciones": 0,
                        "retardos": 0
                    }
                    employees.append(emp)
                row += 1

            wb_v.close()
            wb_f.close()
            
            # Send results
            self.send_json({
                "period": "16 al 30 Abr 2026",
                "uma": uma,
                "employees": employees
            })

        except Exception as e:
            import traceback
            tb = traceback.format_exc()
            print("Error get_employees:\n", tb)
            self.send_json({"error": f"Error reading Excel database: {e}", "details": tb}, 500)

    def save_collaborator(self, body):
        try:
            if not os.path.exists(EXCEL_PATH):
                self.send_json({"error": "Excel database file not found"}, 500)
                return

            cod = body.get("id")
            if not cod:
                self.send_json({"error": "Collaborator ID/Code is required"}, 400)
                return

            # Open with formulas
            wb = openpyxl.load_workbook(EXCEL_PATH, data_only=False)
            ws = wb.active

            # Find if collaborator exists
            row = 6
            found_row = None
            totals_row = None
            
            while True:
                nombre_val = ws.cell(row=row, column=4).value # Column D
                cod_val = ws.cell(row=row, column=2).value # Column B
                
                # Check for totals row
                if nombre_val and any(x in str(nombre_val).upper() for x in ["TOTAL", "SUMA"]):
                    totals_row = row
                    break
                if nombre_val is None and cod_val is None:
                    # Let's check next 3 rows
                    has_more = False
                    for i in range(1, 4):
                        n = ws.cell(row=row+i, column=4).value
                        c = ws.cell(row=row+i, column=2).value
                        if n or c:
                            has_more = True
                    if not has_more:
                        totals_row = row
                        break
                
                if str(cod_val).strip() == str(cod).strip():
                    found_row = row
                    break
                row += 1

            # Determine Target Row
            if found_row:
                target_row = found_row
                print(f"Updating collaborator {cod} at row {target_row}")
            else:
                # Add new row: insert a row at totals_row
                target_row = totals_row
                ws.insert_rows(target_row, amount=1)
                print(f"Adding new collaborator {cod} at inserted row {target_row}")

            # Write values into target row
            ws.cell(row=target_row, column=1).value = body.get("no", "")
            ws.cell(row=target_row, column=2).value = cod
            ws.cell(row=target_row, column=3).value = body.get("empresa", "")
            ws.cell(row=target_row, column=4).value = body.get("nombre", "")
            ws.cell(row=target_row, column=5).value = body.get("area", "")
            ws.cell(row=target_row, column=6).value = body.get("depto", "")
            ws.cell(row=target_row, column=7).value = body.get("puesto", "")
            ws.cell(row=target_row, column=8).value = body.get("lugar", "")
            
            # Dates
            ingreso_str = body.get("ingreso", "")
            if ingreso_str:
                ws.cell(row=target_row, column=9).value = datetime.strptime(ingreso_str, "%Y-%m-%d")
            else:
                ws.cell(row=target_row, column=9).value = None
                
            baja_str = body.get("baja")
            if baja_str:
                ws.cell(row=target_row, column=11).value = datetime.strptime(baja_str, "%Y-%m-%d")
            else:
                ws.cell(row=target_row, column=11).value = None

            ws.cell(row=target_row, column=12).value = "SI" if body.get("fondo_ahorro_activo") else "NO"
            
            # Payment amounts
            salario_diario = float(body.get("salario_diario", 0.0))
            ws.cell(row=target_row, column=13).value = salario_diario if salario_diario > 0 else None
            ws.cell(row=target_row, column=22).value = float(body.get("asimilados", 0.0)) or None
            ws.cell(row=target_row, column=23).value = float(body.get("gasolina", 0.0)) or None
            ws.cell(row=target_row, column=24).value = float(body.get("socio", 0.0)) or None
            ws.cell(row=target_row, column=25).value = float(body.get("efectivo", 0.0)) or None
            ws.cell(row=target_row, column=26).value = float(body.get("facturado", 0.0)) or None
            ws.cell(row=target_row, column=27).value = float(body.get("deuda_carro", 0.0)) or None

            # Calculate Factor de Integracion based on current date vs ingreso date
            if ingreso_str and not baja_str:
                try:
                    ingreso_dt = datetime.strptime(ingreso_str, "%Y-%m-%d")
                    active_dt = datetime(2026, 4, 30) # Anchor year 2026
                    diff_yrs = (active_dt - ingreso_dt).days / 365.25
                    years = max(1, int(diff_yrs))
                    
                    # Mexican Vacations LFT standard
                    def get_vac_days(y):
                        if y <= 1: return 12
                        if y == 2: return 14
                        if y == 3: return 16
                        if y == 4: return 18
                        if y == 5: return 20
                        if y <= 10: return 22
                        if y <= 15: return 24
                        if y <= 20: return 26
                        return 28
                        
                    vac = get_vac_days(years)
                    fi = 1 + (15/365) + ((vac * 0.25) / 365)
                    ws.cell(row=target_row, column=14).value = round(fi, 4)
                except Exception as ex:
                    print(f"Error calculating Factor Integration: {ex}")
                    ws.cell(row=target_row, column=14).value = 1.0493
            else:
                ws.cell(row=target_row, column=14).value = 0.0

            # Inject all nominal calculations formulas
            ws.cell(row=target_row, column=15).value = f"=M{target_row}*N{target_row}"
            ws.cell(row=target_row, column=16).value = f"=M{target_row}*30.4"
            ws.cell(row=target_row, column=17).value = f"=O{target_row}*0.1*30.4"
            ws.cell(row=target_row, column=18).value = f"=O{target_row}*0.1*30.4"
            ws.cell(row=target_row, column=19).value = f"=$S$2*0.4*30.4" # Vales exentos
            ws.cell(row=target_row, column=20).value = f'=IF(L{target_row}="SI",P{target_row}*0.11,0)'
            ws.cell(row=target_row, column=21).value = f"=SUM(P{target_row}:T{target_row})"
            ws.cell(row=target_row, column=28).value = f"=SUM(U{target_row}:AA{target_row})"
            ws.cell(row=target_row, column=29).value = f"=AB{target_row}/2"
            
            # Control columns
            ws.cell(row=target_row, column=30).value = 0
            # Descuento
            if not found_row:
                ws.cell(row=target_row, column=31).value = 0.0
                ws.cell(row=target_row, column=34).value = "NUEVO INGRESO"
            
            ws.cell(row=target_row, column=32).value = f"=AB{target_row}-AE{target_row}"
            ws.cell(row=target_row, column=33).value = f"=AF{target_row}/2"
            ws.cell(row=target_row, column=36).value = f"=AC{target_row}-AG{target_row}"

            # 6. If we inserted a new row, we MUST update the Totals Row sum ranges
            new_totals_row = totals_row + 1 if not found_row else totals_row
            if not found_row:
                columns_to_sum = [
                    (21, "U"), (22, "V"), (23, "W"), (24, "X"), (25, "Y"), (26, "Z"), (27, "AA"), 
                    (28, "AB"), (31, "AE"), (32, "AF"), (36, "AJ")
                ]
                for col_idx, letter in columns_to_sum:
                    ws.cell(row=new_totals_row, column=col_idx).value = f"=SUM({letter}6:{letter}{new_totals_row-1})"
                
                # AC and AG sum
                ws.cell(row=new_totals_row, column=29).value = f"=AF{new_totals_row}/2"
                ws.cell(row=new_totals_row, column=33).value = f"=SUM(AG6:AG{new_totals_row-1})"

            # Save file
            wb.save(EXCEL_PATH)
            wb.close()
            
            self.send_json({"success": True, "message": f"Collaborator saved at row {target_row}"})
            
        except Exception as e:
            import traceback
            self.send_json({"error": f"Error saving collaborator: {e}", "details": traceback.format_exc()}, 500)

    def save_incidences(self, body):
        try:
            if not os.path.exists(EXCEL_PATH):
                self.send_json({"error": "Excel database file not found"}, 500)
                return

            cod = body.get("id")
            if not cod:
                self.send_json({"error": "Collaborator ID/Code is required"}, 400)
                return

            wb = openpyxl.load_workbook(EXCEL_PATH, data_only=False)
            ws = wb.active

            # Find collaborator row
            row = 6
            found_row = None
            while True:
                nombre_val = ws.cell(row=row, column=4).value
                cod_val = ws.cell(row=row, column=2).value
                
                if nombre_val and any(x in str(nombre_val).upper() for x in ["TOTAL", "SUMA"]):
                    break
                if nombre_val is None and cod_val is None:
                    break
                if str(cod_val).strip() == str(cod).strip():
                    found_row = row
                    break
                row += 1

            if not found_row:
                self.send_json({"error": f"Collaborator Cód. {cod} not found in database"}, 404)
                wb.close()
                return

            # Apply incidences
            faltas = int(body.get("faltas", 0))
            descuento_adicional = float(body.get("descuento_adicional", 0.0))
            observaciones = body.get("observaciones", "")

            # AE (Deducción adicional / Préstamo)
            ws.cell(row=found_row, column=31).value = descuento_adicional if descuento_adicional > 0 else None
            # AH (Observaciones)
            ws.cell(row=found_row, column=34).value = observaciones if observaciones else None

            # AG (Sueldo Neto Quincenal)
            # If they have absences, we apply the proportional discount formula
            if faltas > 0:
                dias_laborados = 15 - faltas
                ws.cell(row=found_row, column=33).value = f"=AF{found_row}/2/15*{dias_laborados}"
            else:
                ws.cell(row=found_row, column=33).value = f"=AF{found_row}/2"

            # Save file
            wb.save(EXCEL_PATH)
            wb.close()

            self.send_json({"success": True, "message": f"Incidences applied to collaborator at row {found_row}"})

        except Exception as e:
            import traceback
            self.send_json({"error": f"Error saving incidences: {e}", "details": traceback.format_exc()}, 500)

    def save_config(self, body):
        try:
            if not os.path.exists(EXCEL_PATH):
                self.send_json({"error": "Excel database file not found"}, 500)
                return

            uma = float(body.get("uma", 117.31))

            wb = openpyxl.load_workbook(EXCEL_PATH, data_only=False)
            ws = wb.active

            # Write UMA in S2 (Column 19, Row 2)
            ws.cell(row=2, column=19).value = uma

            # Save file
            wb.save(EXCEL_PATH)
            wb.close()

            self.send_json({"success": True, "message": "Global configuration saved in Excel."})

        except Exception as e:
            self.send_json({"error": f"Error saving global configuration: {e}"}, 500)

if __name__ == "__main__":
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), APIHandler) as httpd:
        print(f"Serving RHM CRM & Prenómina on port {PORT}...")
        httpd.serve_forever()
