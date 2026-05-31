import http.server
import socketserver
import json
import os
import openpyxl
import urllib.parse
import urllib.request
from datetime import datetime
import traceback

PORT = 8000
import sys

# Resolve paths for PyInstaller standalone executables
if getattr(sys, 'frozen', False):
    BASE_DIR = os.path.dirname(sys.executable)
    STATIC_DIR = getattr(sys, '_MEIPASS', BASE_DIR)
    
    # Save configuration and default database in user folder to ensure writability on macOS/Windows
    CONFIG_DIR = os.path.expanduser("~/.rhm_prenomina")
    try:
        os.makedirs(CONFIG_DIR, exist_ok=True)
    except Exception as e:
        print(f"Error creating user config directory: {e}")
        CONFIG_DIR = BASE_DIR
    SCHEMA_PATH = os.path.join(CONFIG_DIR, "schema.json")
else:
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    STATIC_DIR = BASE_DIR
    CONFIG_DIR = BASE_DIR
    SCHEMA_PATH = os.path.join(BASE_DIR, "schema.json")

import shutil

# Extract schema.json first if missing and frozen
if getattr(sys, 'frozen', False):
    bundled_schema = os.path.join(STATIC_DIR, "schema.json")
    if not os.path.exists(SCHEMA_PATH) and os.path.exists(bundled_schema):
        print(f"schema.json missing in config directory. Copying template to: {SCHEMA_PATH}")
        try:
            shutil.copyfile(bundled_schema, SCHEMA_PATH)
        except Exception as e:
            print("Error extracting template schema.json:", e)

def load_schema():
    if not os.path.exists(SCHEMA_PATH):
        return {"columns": [], "uma_cell": "S3", "period": "16 al 30 Abr 2026", "gemini_api_key": "", "pending_clarifications": []}
    try:
        with open(SCHEMA_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        print("Error loading schema.json:", e)
        return {"columns": [], "uma_cell": "S3", "period": "16 al 30 Abr 2026", "gemini_api_key": "", "pending_clarifications": []}

def save_schema(schema):
    try:
        with open(SCHEMA_PATH, "w", encoding="utf-8") as f:
            json.dump(schema, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print("Error saving schema.json:", e)

def get_excel_path():
    try:
        schema = load_schema()
        db_path = schema.get("db_path", "")
        if db_path:
            if os.path.isabs(db_path):
                return db_path
            # Check relative to CONFIG_DIR or BASE_DIR
            opt1 = os.path.abspath(os.path.join(CONFIG_DIR, db_path))
            if os.path.exists(opt1):
                return opt1
            return os.path.abspath(os.path.join(BASE_DIR, db_path))
    except Exception as e:
        print("Error getting Excel path from schema:", e)
    
    if getattr(sys, 'frozen', False):
        return os.path.abspath(os.path.join(CONFIG_DIR, "Nomina ciega.xlsx"))
    return os.path.abspath(os.path.join(BASE_DIR, "Nomina ciega.xlsx"))

def copy_template_if_needed(db_path):
    if os.path.exists(db_path):
        return
    
    # If it is an XLSX file, copy bundled excel template
    if db_path.lower().endswith(".xlsx"):
        bundled_excel = os.path.join(STATIC_DIR, "Nomina ciega.xlsx")
        if not os.path.exists(bundled_excel):
            bundled_excel = os.path.join(BASE_DIR, "Nomina ciega.xlsx")
            
        if os.path.exists(bundled_excel):
            print(f"Excel database file missing. Copying template to: {db_path}")
            try:
                os.makedirs(os.path.dirname(db_path), exist_ok=True)
                shutil.copyfile(bundled_excel, db_path)
            except Exception as e:
                print("Error copying template Excel:", e)
    elif db_path.lower().endswith(".csv"):
        # If it is CSV, load bundled excel and save it as CSV
        bundled_excel = os.path.join(STATIC_DIR, "Nomina ciega.xlsx")
        if not os.path.exists(bundled_excel):
            bundled_excel = os.path.join(BASE_DIR, "Nomina ciega.xlsx")
            
        if os.path.exists(bundled_excel):
            print(f"CSV Database file missing. Converting template to CSV: {db_path}")
            try:
                os.makedirs(os.path.dirname(db_path), exist_ok=True)
                wb = openpyxl.load_workbook(bundled_excel, data_only=True)
                ws = wb.active
                import csv
                with open(db_path, "w", encoding="utf-8-sig", newline="") as f:
                    writer = csv.writer(f)
                    for r in range(1, ws.max_row + 1):
                        row_vals = [ws.cell(row=r, column=c).value for c in range(1, ws.max_column + 1)]
                        writer.writerow(row_vals)
                wb.close()
            except Exception as e:
                print("Error creating CSV template:", e)

def load_workbook_agnostic(path, data_only=False):
    if path.lower().endswith(".csv"):
        import csv
        wb = openpyxl.Workbook()
        ws = wb.active
        if os.path.exists(path):
            try:
                with open(path, "r", encoding="utf-8-sig", newline="") as f:
                    reader = csv.reader(f)
                    for r_idx, row in enumerate(reader, start=1):
                        for c_idx, val in enumerate(row, start=1):
                            if val is not None:
                                val_str = str(val).strip()
                                if val_str.startswith("="):
                                    ws.cell(row=r_idx, column=c_idx).value = val_str
                                else:
                                    try:
                                        if "." in val_str:
                                            ws.cell(row=r_idx, column=c_idx).value = float(val_str)
                                        else:
                                            ws.cell(row=r_idx, column=c_idx).value = int(val_str)
                                    except ValueError:
                                        ws.cell(row=r_idx, column=c_idx).value = val
                            else:
                                ws.cell(row=r_idx, column=c_idx).value = None
            except Exception as e:
                print(f"Error loading CSV to workbook: {e}")
        return wb
    else:
        return openpyxl.load_workbook(path, data_only=data_only)

def save_workbook_agnostic(wb, path):
    if path.lower().endswith(".csv"):
        import csv
        ws = wb.active
        try:
            with open(path, "w", encoding="utf-8-sig", newline="") as f:
                writer = csv.writer(f)
                max_r = ws.max_row
                max_c = ws.max_column
                # Find last non-empty row index to avoid endless empty trailing rows
                last_non_empty = 0
                for r in range(1, max_r + 1):
                    row_vals = [ws.cell(row=r, column=c).value for c in range(1, max_c + 1)]
                    if any(x is not None and str(x).strip() != "" for x in row_vals):
                        last_non_empty = r
                
                for r in range(1, last_non_empty + 1):
                    row_vals = []
                    for c in range(1, max_c + 1):
                        row_vals.append(ws.cell(row=r, column=c).value)
                    writer.writerow(row_vals)
        except Exception as e:
            print(f"Error saving CSV: {e}")
            raise e
    else:
        wb.save(path)

def select_file_via_dialog():
    # 1. Try pywebview first if active windows exist
    try:
        import webview
        if hasattr(webview, "windows") and webview.windows:
            win = webview.windows[0]
            res = win.create_file_dialog(
                dialogue_type=webview.OPEN_DIALOG,
                file_types=('Archivos de Nómina (*.xlsx;*.csv)', 'Excel (*.xlsx)', 'CSV (*.csv)', 'Todos (*.*)')
            )
            if res:
                return res[0] if isinstance(res, (list, tuple)) else res
            return None
    except Exception as e:
        print("Failed to open dialog via pywebview:", e)

    # 2. Fallback to AppleScript on macOS (completely thread-safe)
    if sys.platform == "darwin":
        import subprocess
        try:
            cmd = "osascript -e 'POSIX path of (choose file of type {\"xlsx\", \"csv\"} with prompt \"Seleccione el archivo de Prenómina\")'"
            proc = subprocess.run(cmd, shell=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            if proc.returncode == 0:
                path = proc.stdout.strip()
                if path:
                    return path
            return None
        except Exception as e:
            print("Failed to open dialog via osascript:", e)

    # 3. Fallback to PowerShell on Windows (completely thread-safe)
    if sys.platform == "win32":
        import subprocess
        try:
            cmd = (
                "powershell -Command \""
                "Add-Type -AssemblyName System.Windows.Forms; "
                "$f = New-Object System.Windows.Forms.OpenFileDialog; "
                "$f.Filter = 'Nómina Files (*.xlsx;*.csv)|*.xlsx;*.csv'; "
                "if ($f.ShowDialog() -eq 'OK') { $f.FileName }\""
            )
            proc = subprocess.run(cmd, shell=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            if proc.returncode == 0:
                path = proc.stdout.strip()
                if path:
                    return path
            return None
        except Exception as e:
            print("Failed to open dialog via powershell:", e)

    # 4. Fallback to Tkinter on non-macOS/Windows or if others failed (best effort)
    try:
        import tkinter as tk
        from tkinter import filedialog
        root = tk.Tk()
        root.withdraw()
        root.attributes('-topmost', True)
        file_path = filedialog.askopenfilename(
            title="Seleccionar archivo de Prenómina",
            filetypes=[("Archivos de Nómina", "*.xlsx;*.csv"), ("Todos", "*.*")]
        )
        root.destroy()
        return file_path if file_path else None
    except Exception as e:
        print("Failed to open dialog via tkinter:", e)
        return None

# Extract database template if missing at start
copy_template_if_needed(get_excel_path())

def get_field_index(schema, field_name):
    for col in schema["columns"]:
        if col["field"] == field_name:
            return col["index"]
    return None

def get_field_letter(schema, field_name):
    for col in schema["columns"]:
        if col["field"] == field_name:
            return col["letter"]
    return ""

def get_gemini_api_key(schema):
    return os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY") or schema.get("gemini_api_key", "")

def call_gemini_api(prompt, api_key):
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={api_key}"
    req_data = {
        "contents": [{
            "parts": [{"text": prompt}]
        }],
        "generationConfig": {
            "responseMimeType": "application/json"
        }
    }
    headers = {"Content-Type": "application/json"}
    data = json.dumps(req_data).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            res_body = response.read().decode("utf-8")
            res_json = json.loads(res_body)
            candidate = res_json["candidates"][0]
            text = candidate["content"]["parts"][0]["text"]
            return json.loads(text)
    except Exception as e:
        print("Error calling Gemini API:", e)
        return None

def heal_schema_with_ai(current_headers, old_schema):
    api_key = get_gemini_api_key(old_schema)
    if not api_key:
        print("Gemini API Key is missing. Creating a temporary pending clarification to guide the user.")
        updated_schema = dict(old_schema)
        updated_schema["pending_clarifications"] = [{
            "field": "gemini_api_key",
            "question": "Se han detectado cambios en las cabeceras de Excel, pero no hay una GEMINI_API_KEY configurada. Por favor, introduce tu clave en la pestaña Configuración para que el Agente pueda procesar y clasificar las nuevas columnas de forma automática.",
            "options": ["Reintentar con clave configurada", "Omitir por ahora"]
        }]
        return updated_schema

    old_columns_summary = []
    for col in old_schema["columns"]:
        old_columns_summary.append({
            "index": col["index"],
            "letter": col["letter"],
            "header": col["header"],
            "field": col["field"],
            "category": col["category"]
        })

    prompt = f"""
    You are an expert AI data engineer specialized in payroll system integrations.
    The user has modified their Excel payroll spreadsheet. I will give you:
    1. The old schema configuration mapping Excel columns to database fields.
    2. The new list of headers read from row 5 of the Excel sheet.

    Old columns mapping:
    {json.dumps(old_columns_summary, ensure_ascii=False, indent=2)}

    New Excel headers (1-based index):
    {json.dumps([{ 'index': idx + 1, 'header': header } for idx, header in enumerate(current_headers) if header is not None], ensure_ascii=False, indent=2)}

    Your task:
    1. Align the columns index and letters to match the new headers. If headers shifted, update their index and letter accordingly.
    2. Identify any NEW headers that were not in the old columns mapping.
    3. Categorize new headers as one of the following:
       - 'metadata': General info (text, dates, or boolean fields like flags)
       - 'nominal_imss': Core IMSS daily salary or related fields (user editable float)
       - 'others': Other monthly payment schemas (commissions, bonuses, petrol, etc. - user editable float)
       - 'deduction': Incidences / discounts to apply (e.g. loans, debts - user editable float)
       - 'calculated': Column calculated via formulas (e.g. SDI, Sueldo Nominal, sums)
    4. For any new header, assign it a unique snake_case 'field' identifier (e.g. 'bono_asistencia', 'prestamo_personal').
    5. Set 'type': 'float' for numeric payment fields, 'date' for date strings, 'boolean' for SI/NO flags, 'string' for general text.
    6. Set 'label': A short clean UI label in Spanish (e.g. 'Bono de Asistencia ($)').
    7. Set 'editable': true for metadata, nominal_imss, others.
    8. Set 'incidence_editable': true for deductions.
    9. If a new column is a new deduction or calculation variable and you are not 100% sure if it is a flat deduction or needs division (like a loan split over months), do NOT guess. Instead, add a clarification question to the 'pending_clarifications' list in the format:
       {{
         "field": "the_new_field_identifier",
         "question": "A short clear question in Spanish asking the accountant how to calculate/apply this new column.",
         "options": ["Option A text in Spanish", "Option B text in Spanish"]
       }}
    10. Return a JSON object with:
        {{
          "columns": [ ... ],
          "pending_clarifications": [ ... ]
        }}
        The 'columns' array must contain the complete set of columns (both old/updated and new ones), sorted by index.

    Respond strictly in JSON format.
    """
    res = call_gemini_api(prompt, api_key)
    if res and "columns" in res:
        updated_schema = dict(old_schema)
        old_fields = {col["field"]: col for col in old_schema["columns"]}
        merged_cols = []
        for col in res["columns"]:
            f_name = col["field"]
            letter = openpyxl.utils.get_column_letter(col["index"])
            col["letter"] = letter
            if f_name in old_fields:
                col["editable"] = old_fields[f_name].get("editable", col.get("editable", True))
                col["incidence_editable"] = old_fields[f_name].get("incidence_editable", col.get("incidence_editable", False))
                if "formula_template" in old_fields[f_name]:
                    col["formula_template"] = old_fields[f_name]["formula_template"]
            merged_cols.append(col)
        updated_schema["columns"] = sorted(merged_cols, key=lambda x: x["index"])
        updated_schema["pending_clarifications"] = res.get("pending_clarifications", [])
        return updated_schema
    else:
        print("AI Schema healing failed or timed out. Using old schema as fallback.")
        return old_schema

def check_and_heal_schema():
    schema = load_schema()
    excel_path = get_excel_path()
    if not os.path.exists(excel_path):
        return schema
    try:
        wb = load_workbook_agnostic(excel_path, data_only=True)
        ws = wb.active
        current_headers = []
        for col_idx in range(1, ws.max_column + 1):
            val = ws.cell(row=5, column=col_idx).value
            current_headers.append(val)
        wb.close()

        while current_headers and (current_headers[-1] is None or str(current_headers[-1]).strip() == ""):
            current_headers.pop()

        schema_headers = [col.get("header") for col in schema["columns"]]
        while schema_headers and (schema_headers[-1] is None or str(schema_headers[-1]).strip() == ""):
            schema_headers.pop()

        mismatch = False
        if len(current_headers) != len(schema_headers):
            mismatch = True
        else:
            for ch, sh in zip(current_headers, schema_headers):
                ch_str = str(ch).strip() if ch is not None else ""
                sh_str = str(sh).strip() if sh is not None else ""
                if ch_str != sh_str:
                    mismatch = True
                    break

        if mismatch:
            print("Excel headers mismatch detected! Running self-healing schema wrapper...")
            new_schema = heal_schema_with_ai(current_headers, schema)
            save_schema(new_schema)
            return new_schema
        return schema
    except Exception as e:
        print("Error checking schema alignment:", e)
        return schema

def inject_formulas_dynamically(ws, row, schema):
    def L(field_name):
        return get_field_letter(schema, field_name)
    
    uma_cell = schema.get("uma_cell", "S3")
    if "$" not in uma_cell:
        import re
        m = re.match(r"([A-Z]+)([0-9]+)", uma_cell)
        if m:
            uma_cell = f"${m.group(1)}${m.group(2)}"
    
    # Build core formulas dynamically based on letter configurations
    formulas = {
        "sdi": f"={L('salario_diario')}{row}*{L('factor_integracion')}{row}",
        "sueldo_nominal": f"={L('salario_diario')}{row}*$N$3",
        "puntualidad": f"={L('sdi')}{row}*0.1*$N$3",
        "asistencia": f"={L('sdi')}{row}*0.1*$N$3",
        "vales_despensa": f"={uma_cell}*($P$3/100)*$N$3",
        "fondo_ahorro": f'=IF({L("fondo_ahorro_activo")}{row}="SI",{L("sueldo_nominal")}{row}*($L$3/100),0)',
        "percepcion_sueldos": f"=SUM({L('sueldo_nominal')}{row}:{L('fondo_ahorro')}{row})",
        "bruto_mensual": f"=SUM({L('percepcion_sueldos')}{row}:{L('deuda_carro')}{row})",
        "bruto_quincenal": f"={L('bruto_mensual')}{row}/2",
        "bruto_mensual_neto": f"={L('bruto_mensual')}{row}-{L('descuento_adicional')}{row}",
        "descuento_quincenal_acumulado": f"={L('bruto_quincenal')}{row}-{L('neto_quincenal')}{row}"
    }

    # Write formulas into the spreadsheet row
    for col in schema["columns"]:
        f = col["field"]
        if f in formulas:
            ws.cell(row=row, column=col["index"]).value = formulas[f]

class APIHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=STATIC_DIR, **kwargs)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def send_json(self, data, status=200):
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode("utf-8"))

    def do_GET(self):
        path_only = self.path.split("?")[0]
        if path_only == "/api/employees":
            self.get_employees()
        elif path_only == "/api/schema":
            self.get_schema()
        elif path_only == "/api/select-file":
            self.select_file()
        else:
            super().do_GET()

    def do_POST(self):
        content_length = int(self.headers.get('Content-Length', 0))
        post_data = self.rfile.read(content_length) if content_length > 0 else b""
        try:
            body = json.loads(post_data.decode("utf-8")) if post_data else {}
        except Exception as e:
            self.send_json({"error": f"Invalid JSON: {e}"}, 400)
            return

        path_only = self.path.split("?")[0]
        if path_only == "/api/collaborator":
            self.save_collaborator(body)
        elif path_only == "/api/incidences":
            self.save_incidences(body)
        elif path_only == "/api/config":
            self.save_config(body)
        elif path_only == "/api/schema/clarify":
            self.save_clarify(body)
        else:
            self.send_json({"error": "Endpoint not found"}, 404)

    def get_schema(self):
        schema = check_and_heal_schema()
        self.send_json(schema)

    def select_file(self):
        path = select_file_via_dialog()
        self.send_json({"selected_path": path})

    def save_clarify(self, body):
        schema = load_schema()
        field = body.get("field")
        answer = body.get("answer")
        
        # Apply clarification logic (e.g. modify category or custom properties)
        # Find column in schema and update based on user answers
        for col in schema["columns"]:
            if col["field"] == field:
                if "deducción" in answer.lower():
                    col["category"] = "deduction"
                    col["incidence_editable"] = True
                elif "percepción" in answer.lower():
                    col["category"] = "others"
                    col["editable"] = True
                print(f"Applied clarification for {field}: categorized as {col['category']}")
        
        # Remove from pending list
        schema["pending_clarifications"] = [q for q in schema["pending_clarifications"] if q["field"] != field]
        save_schema(schema)
        self.send_json({"success": True, "schema": schema})

    def get_employees(self):
        try:
            schema = check_and_heal_schema()
            excel_path = get_excel_path()
            copy_template_if_needed(excel_path)
            if not os.path.exists(excel_path):
                self.send_json({"error": f"Database file not found at {excel_path}"}, 500)
                return

            wb_v = load_workbook_agnostic(excel_path, data_only=True)
            wb_f = load_workbook_agnostic(excel_path, data_only=False)
            sheet_v = wb_v.active
            sheet_f = wb_f.active

            # Read dynamic configuration cells
            uma_cell_coord = schema.get("uma_cell", "S3")
            vales_pct_cell = schema.get("vales_pct_cell", "P3")
            dias_mes_cell = schema.get("dias_mes_cell", "N3")
            fa_pct_cell = schema.get("fa_pct_cell", "L3")
            aguinaldo_cell = schema.get("aguinaldo_cell", "J3")
            prima_cell = schema.get("prima_cell", "H3")

            def get_cell_float(sheet, cell, default):
                val = sheet[cell].value
                if val is None:
                    return default
                try:
                    return float(str(val).replace(",", "").strip())
                except:
                    return default

            uma = get_cell_float(sheet_v, uma_cell_coord, 117.31)
            vales_pct = get_cell_float(sheet_v, vales_pct_cell, 40.0)
            dias_mes = get_cell_float(sheet_v, dias_mes_cell, 30.4)
            fa_pct = get_cell_float(sheet_v, fa_pct_cell, 11.0)
            aguinaldo = get_cell_float(sheet_v, aguinaldo_cell, 15.0)
            prima = get_cell_float(sheet_v, prima_cell, 25.0)

            config = {
                "uma": uma,
                "valesPct": vales_pct,
                "diasMes": dias_mes,
                "faPct": fa_pct,
                "aguinaldo": aguinaldo,
                "prima": prima
            }

            nombre_col = get_field_index(schema, "nombre")
            id_col = get_field_index(schema, "id")
            neto_quincenal_col = get_field_index(schema, "neto_quincenal")

            employees = []
            row = 6
            while True:
                nombre_val = sheet_v.cell(row=row, column=nombre_col).value
                cod_val = sheet_v.cell(row=row, column=id_col).value
                
                if nombre_val and any(x in str(nombre_val).upper() for x in ["TOTAL", "SUMA"]):
                    break
                if nombre_val is None and cod_val is None:
                    has_more = False
                    for i in range(1, 4):
                        n = sheet_v.cell(row=row+i, column=nombre_col).value
                        c = sheet_v.cell(row=row+i, column=id_col).value
                        if n or c:
                            has_more = True
                    if not has_more:
                        break
                
                if nombre_val:
                    def val_to_float(cell_val):
                        if cell_val is None: return 0.0
                        v = str(cell_val).replace(",", "").strip()
                        if v in ["-", "", "None"]: return 0.0
                        try: return float(v)
                        except ValueError: return 0.0

                    # Parse absences from dynamic formula in neto_quincenal column
                    faltas = 0
                    if neto_quincenal_col:
                        formula_ag = sheet_f.cell(row=row, column=neto_quincenal_col).value
                        if isinstance(formula_ag, str) and "/15*" in formula_ag:
                            try:
                                parts = formula_ag.split("*")
                                days_worked = int(parts[-1])
                                faltas = 15 - days_worked
                            except:
                                pass

                    cod_id = str(cod_val).strip() if cod_val is not None else f"TEMP_{row}"

                    # Dynamically read all fields defined in schema
                    emp = {
                        "id": cod_id,
                        "_row": row,
                        "faltas": faltas,
                        "vacaciones": 0,
                        "retardos": 0
                    }
                    for col in schema["columns"]:
                        f = col["field"]
                        t = col["type"]
                        val = sheet_v.cell(row=row, column=col["index"]).value
                        
                        if f == "id":
                            continue # Already handled
                        elif t == "float":
                            emp[f] = val_to_float(val)
                        elif t == "date":
                            if isinstance(val, datetime):
                                emp[f] = val.strftime("%Y-%m-%d")
                            else:
                                emp[f] = str(val)[:10] if val else ""
                        elif t == "boolean":
                            emp[f] = str(val or "").upper() == "SI"
                        else:
                            emp[f] = str(val or "").strip()
                            
                    employees.append(emp)
                row += 1

            wb_v.close()
            wb_f.close()
            
            self.send_json({
                "period": schema.get("period", "16 al 30 Abr 2026"),
                "uma": uma,
                "config": config,
                "db_path": schema.get("db_path", "Nomina ciega.xlsx"),
                "employees": employees
            })

        except Exception as e:
            tb = traceback.format_exc()
            print("Error get_employees:\n", tb)
            self.send_json({"error": f"Error reading Excel database: {e}", "details": tb}, 500)

    def save_collaborator(self, body):
        try:
            schema = check_and_heal_schema()
            excel_path = get_excel_path()
            if not os.path.exists(excel_path):
                self.send_json({"error": "Database file not found"}, 500)
                return

            cod = body.get("id")
            if not cod:
                self.send_json({"error": "Collaborator ID/Code is required"}, 400)
                return

            wb = load_workbook_agnostic(excel_path, data_only=False)
            ws = wb.active

            nombre_col = get_field_index(schema, "nombre")
            id_col = get_field_index(schema, "id")

            row = 6
            found_row = None
            totals_row = None
            
            is_temp_id = isinstance(cod, str) and cod.startswith("TEMP_")
            temp_row_resolved = None
            if is_temp_id:
                try:
                    temp_row_resolved = int(cod.split("_")[1])
                except ValueError:
                    pass

            while True:
                nombre_val = ws.cell(row=row, column=nombre_col).value
                cod_val = ws.cell(row=row, column=id_col).value
                
                if nombre_val and any(x in str(nombre_val).upper() for x in ["TOTAL", "SUMA"]):
                    totals_row = row
                    break
                if nombre_val is None and cod_val is None:
                    has_more = False
                    for i in range(1, 4):
                        n = ws.cell(row=row+i, column=nombre_col).value
                        c = ws.cell(row=row+i, column=id_col).value
                        if n or c:
                            has_more = True
                    if not has_more:
                        totals_row = row
                        break
                
                if temp_row_resolved == row:
                    found_row = row
                elif not is_temp_id and cod_val is not None and str(cod_val).strip() == str(cod).strip():
                    found_row = row
                row += 1

            if found_row:
                target_row = found_row
                print(f"Updating collaborator {cod} at row {target_row}")
            else:
                target_row = totals_row
                ws.insert_rows(target_row, amount=1)
                print(f"Adding new collaborator {cod} at inserted row {target_row}")

            # Write values dynamically based on schema config
            for col in schema["columns"]:
                f = col["field"]
                if not col.get("editable", True):
                    continue
                t = col["type"]
                val = body.get(f)
                
                cell_ref = ws.cell(row=target_row, column=col["index"])
                if f == "id":
                    cell_ref.value = None if is_temp_id else val
                elif t == "float":
                    v_float = float(val) if val is not None and str(val).strip() != "" else 0.0
                    cell_ref.value = v_float if v_float > 0 else None
                elif t == "date":
                    cell_ref.value = datetime.strptime(val, "%Y-%m-%d") if val else None
                elif t == "boolean":
                    cell_ref.value = "SI" if val else "NO"
                else:
                    cell_ref.value = str(val).strip() if val else None

            # Calculate Factor de Integracion based on current date vs ingreso date
            ingreso_str = body.get("ingreso", "")
            baja_str = body.get("baja", "")
            fi_col = get_field_index(schema, "factor_integracion")
            
            if fi_col:
                if ingreso_str and not baja_str:
                    try:
                        ingreso_dt = datetime.strptime(ingreso_str, "%Y-%m-%d")
                        active_dt = datetime(2026, 4, 30)
                        diff_yrs = (active_dt - ingreso_dt).days / 365.25
                        years = max(1, int(diff_yrs))
                        
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
                        ws.cell(row=target_row, column=fi_col).value = round(fi, 4)
                    except Exception as ex:
                        print(f"Error calculating Factor Integration: {ex}")
                        ws.cell(row=target_row, column=fi_col).value = 1.0493
                else:
                    ws.cell(row=target_row, column=fi_col).value = 0.0

            # Inject all calculations formulas dynamically
            inject_formulas_dynamically(ws, target_row, schema)

            # Normal neto_quincenal (since no absences on initial creation/edit unless previously set)
            neto_quincenal_col = get_field_index(schema, "neto_quincenal")
            bruto_mensual_neto_letter = get_field_letter(schema, "bruto_mensual_neto")
            if neto_quincenal_col:
                ws.cell(row=target_row, column=neto_quincenal_col).value = f"={bruto_mensual_neto_letter}{target_row}/2"

            # 6. Re-sum totals in Row 21 or new totals row
            new_totals_row = totals_row + 1 if not found_row else totals_row
            columns_to_sum = [
                "sueldo_nominal", "puntualidad", "asistencia", "vales_despensa", "fondo_ahorro",
                "percepcion_sueldos", "asimilados", "gasolina", "socio", "efectivo", "facturado", 
                "deuda_carro", "bruto_mensual", "descuento_adicional", "bruto_mensual_neto", "descuento_quincenal_acumulado"
            ]
            for field in columns_to_sum:
                col_idx = get_field_index(schema, field)
                letter = get_field_letter(schema, field)
                if col_idx and letter:
                    ws.cell(row=new_totals_row, column=col_idx).value = f"=SUM({letter}6:{letter}{new_totals_row-1})"
            
            # AC and AG sum
            bruto_quincenal_col = get_field_index(schema, "bruto_quincenal")
            if bruto_quincenal_col:
                ws.cell(row=new_totals_row, column=bruto_quincenal_col).value = f"=AF{new_totals_row}/2"
            if neto_quincenal_col:
                neto_quincenal_letter = get_field_letter(schema, "neto_quincenal")
                ws.cell(row=new_totals_row, column=neto_quincenal_col).value = f"=SUM({neto_quincenal_letter}6:{neto_quincenal_letter}{new_totals_row-1})"

            # Save file
            save_workbook_agnostic(wb, excel_path)
            wb.close()
            
            self.send_json({"success": True, "message": f"Collaborator saved at row {target_row}"})
            
        except PermissionError:
            self.send_json({"error": f"El archivo '{os.path.basename(excel_path)}' está abierto en Microsoft Excel o bloqueado por el sistema. Por favor, cierra el archivo local e inténtalo de nuevo."}, 500)
        except Exception as e:
            self.send_json({"error": f"Error saving collaborator: {e}", "details": traceback.format_exc()}, 500)

    def save_incidences(self, body):
        try:
            schema = check_and_heal_schema()
            excel_path = get_excel_path()
            if not os.path.exists(excel_path):
                self.send_json({"error": "Database file not found"}, 500)
                return

            cod = body.get("id")
            if not cod:
                self.send_json({"error": "Collaborator ID/Code is required"}, 400)
                return

            wb = load_workbook_agnostic(excel_path, data_only=False)
            ws = wb.active

            nombre_col = get_field_index(schema, "nombre")
            id_col = get_field_index(schema, "id")

            row = 6
            found_row = None
            is_temp_id = isinstance(cod, str) and cod.startswith("TEMP_")
            temp_row_resolved = None
            if is_temp_id:
                try:
                    temp_row_resolved = int(cod.split("_")[1])
                except ValueError:
                    pass

            while True:
                nombre_val = ws.cell(row=row, column=nombre_col).value
                cod_val = ws.cell(row=row, column=id_col).value
                
                if nombre_val and any(x in str(nombre_val).upper() for x in ["TOTAL", "SUMA"]):
                    break
                if nombre_val is None and cod_val is None:
                    break
                if temp_row_resolved == row:
                    found_row = row
                    break
                elif not is_temp_id and cod_val is not None and str(cod_val).strip() == str(cod).strip():
                    found_row = row
                    break
                row += 1

            if not found_row:
                self.send_json({"error": f"Collaborator Cód. {cod} not found in database"}, 404)
                wb.close()
                return

            # Apply incidences dynamically
            faltas = int(body.get("faltas", 0))
            descuento_adicional = float(body.get("descuento_adicional", 0.0))
            observaciones = body.get("observaciones", "")

            descuento_col = get_field_index(schema, "descuento_adicional")
            observaciones_col = get_field_index(schema, "observaciones")
            neto_quincenal_col = get_field_index(schema, "neto_quincenal")
            bruto_mensual_neto_letter = get_field_letter(schema, "bruto_mensual_neto")

            if descuento_col:
                ws.cell(row=found_row, column=descuento_col).value = descuento_adicional if descuento_adicional > 0 else None
            if observaciones_col:
                ws.cell(row=found_row, column=observaciones_col).value = observaciones if observaciones else None

            if neto_quincenal_col:
                if faltas > 0:
                    dias_laborados = 15 - faltas
                    ws.cell(row=found_row, column=neto_quincenal_col).value = f"={bruto_mensual_neto_letter}{found_row}/2/15*{dias_laborados}"
                else:
                    ws.cell(row=found_row, column=neto_quincenal_col).value = f"={bruto_mensual_neto_letter}{found_row}/2"

            # Save file
            save_workbook_agnostic(wb, excel_path)
            wb.close()

            self.send_json({"success": True, "message": f"Incidences applied to collaborator at row {found_row}"})

        except PermissionError:
            self.send_json({"error": f"El archivo '{os.path.basename(excel_path)}' está abierto en Microsoft Excel o bloqueado por el sistema. Por favor, cierra el archivo local e inténtalo de nuevo."}, 500)
        except Exception as e:
            self.send_json({"error": f"Error saving incidences: {e}", "details": traceback.format_exc()}, 500)

    def save_config(self, body):
        try:
            uma = float(body.get("uma", 117.31))
            vales_pct = float(body.get("vales_pct", 40.0))
            dias_mes = float(body.get("dias_mes", 30.4))
            fa_pct = float(body.get("fa_pct", 11.0))
            aguinaldo = float(body.get("aguinaldo", 15.0))
            prima = float(body.get("prima", 25.0))
            api_key = body.get("gemini_api_key", "")
            db_path = body.get("db_path", "")

            schema = load_schema()
            schema["gemini_api_key"] = api_key
            schema["uma_cell"] = "S3"
            schema["vales_pct_cell"] = "P3"
            schema["dias_mes_cell"] = "N3"
            schema["fa_pct_cell"] = "L3"
            schema["aguinaldo_cell"] = "J3"
            schema["prima_cell"] = "H3"
            
            if db_path is not None:
                db_path_lower = db_path.strip().lower()
                if db_path_lower.endswith(".pages") or db_path_lower.endswith(".numbers"):
                    self.send_json({"error": "Formato de archivo no soportado. Por favor usa Excel (.xlsx) o CSV (.csv)."}, 400)
                    return
                schema["db_path"] = db_path.strip()
                
            save_schema(schema)

            excel_path = get_excel_path()
            copy_template_if_needed(excel_path)

            wb = load_workbook_agnostic(excel_path, data_only=False)
            ws = wb.active

            # Write configurations and their labels in Row 3 of Excel
            ws["G3"].value = "PRIMA %:"
            ws["H3"].value = prima
            ws["H3"].number_format = 'General'
            ws["I3"].value = "AGUINALDO DYS:"
            ws["J3"].value = aguinaldo
            ws["J3"].number_format = 'General'
            ws["K3"].value = "FA %:"
            ws["L3"].value = fa_pct
            ws["L3"].number_format = 'General'
            ws["M3"].value = "DIAS MES:"
            ws["N3"].value = dias_mes
            ws["N3"].number_format = 'General'
            ws["O3"].value = "VALES %:"
            ws["P3"].value = vales_pct
            ws["P3"].number_format = 'General'
            ws["R3"].value = "UMA 2026:"
            ws["S3"].value = uma
            ws["S3"].number_format = 'General'

            save_workbook_agnostic(wb, excel_path)
            wb.close()

            self.send_json({"success": True, "message": "Global configuration saved in Excel."})

        except PermissionError:
            self.send_json({"error": f"El archivo '{os.path.basename(excel_path)}' está abierto en Microsoft Excel o bloqueado por el sistema. Por favor, cierra el archivo local e inténtalo de nuevo."}, 500)
        except Exception as e:
            self.send_json({"error": f"Error saving global configuration: {e}"}, 500)

if __name__ == "__main__":
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), APIHandler) as httpd:
        print(f"Serving RHM CRM & Prenómina on port {PORT}...")
        httpd.serve_forever()
