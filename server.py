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

def extract_default_payroll_rules(docx_path):
    if not os.path.exists(docx_path):
        return ""
    try:
        import zipfile
        import xml.etree.ElementTree as ET
        import io
        with open(docx_path, 'rb') as f:
            data_bytes = f.read()
        with zipfile.ZipFile(io.BytesIO(data_bytes)) as z:
            doc_xml = z.read('word/document.xml')
            root = ET.fromstring(doc_xml)
            paragraphs = []
            for elem in root.iter():
                tag_name = elem.tag.split('}')[-1]
                if tag_name == 'p':
                    p_text = []
                    for child in elem.iter():
                        child_tag = child.tag.split('}')[-1]
                        if child_tag == 't' and child.text:
                            p_text.append(child.text)
                    text_str = "".join(p_text).strip()
                    if text_str:
                        paragraphs.append(text_str)
            return "\n\n".join(paragraphs)
    except Exception as e:
        print("Error extracting default payroll rules from docx:", e)
        return ""

def load_schema():
    default_schema = {"columns": [], "uma_cell": "S3", "period": "16 al 30 Abr 2026", "gemini_api_key": "", "pending_clarifications": [], "payroll_rules": ""}
    if not os.path.exists(SCHEMA_PATH):
        docx_local = os.path.join(BASE_DIR, "CALCULO DE LA PRENOMINA.docx")
        default_schema["payroll_rules"] = extract_default_payroll_rules(docx_local)
        return default_schema
    try:
        with open(SCHEMA_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
            if "payroll_rules" not in data or not data["payroll_rules"]:
                docx_local = os.path.join(BASE_DIR, "CALCULO DE LA PRENOMINA.docx")
                data["payroll_rules"] = extract_default_payroll_rules(docx_local)
            return data
    except Exception as e:
        print("Error loading schema.json:", e)
        return default_schema

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

def find_headers_row(ws):
    # Scan the first 15 rows to find the row containing header cells
    for r in range(1, 16):
        # We check the first 10 columns
        for c in range(1, min(ws.max_column + 1, 11)):
            val = ws.cell(row=r, column=c).value
            if val and any(x in str(val).upper() for x in ["NOMBRE COMPLETO", "COD.", "NO."]):
                return r
    return 5 # Fallback to 5 if not found

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
    # 1. Try AppleScript on macOS first (thread-safe, out-of-process)
    if sys.platform == "darwin":
        import subprocess
        try:
            # Command System Events to activate (bringing its dialog window to the front)
            cmd = "osascript -e 'tell application \"System Events\"' -e 'activate' -e 'POSIX path of (choose file with prompt \"Seleccione el archivo de Prenómina\")' -e 'end tell'"
            proc = subprocess.run(cmd, shell=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            if proc.returncode == 0:
                path = proc.stdout.strip()
                if path:
                    return path
            else:
                print("osascript select_file_via_dialog failed:")
                print("Exit code:", proc.returncode)
                print("Stdout:", proc.stdout)
                print("Stderr:", proc.stderr)
            return None
        except Exception as e:
            print("Failed to open dialog via osascript:", e)

    # 2. Try PowerShell on Windows (thread-safe, out-of-process)
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

    # 3. Fallback to pywebview create_file_dialog (only if available)
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
    return None

def select_rules_file_via_dialog():
    # 1. Try AppleScript on macOS first (thread-safe, out-of-process)
    if sys.platform == "darwin":
        import subprocess
        try:
            # Command System Events to activate (bringing its dialog window to the front)
            cmd = "osascript -e 'tell application \"System Events\"' -e 'activate' -e 'POSIX path of (choose file with prompt \"Seleccione el archivo de Reglas de Nómina\")' -e 'end tell'"
            proc = subprocess.run(cmd, shell=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            if proc.returncode == 0:
                path = proc.stdout.strip()
                if path:
                    return path
            else:
                print("osascript select_rules_file_via_dialog failed:")
                print("Exit code:", proc.returncode)
                print("Stdout:", proc.stdout)
                print("Stderr:", proc.stderr)
            return None
        except Exception as e:
            print("Failed to open rules dialog via osascript:", e)

    # 2. Try PowerShell on Windows (thread-safe, out-of-process)
    if sys.platform == "win32":
        import subprocess
        try:
            cmd = (
                "powershell -Command \""
                "Add-Type -AssemblyName System.Windows.Forms; "
                "$f = New-Object System.Windows.Forms.OpenFileDialog; "
                "$f.Filter = 'Rules Files (*.txt;*.md;*.docx)|*.txt;*.md;*.docx'; "
                "if ($f.ShowDialog() -eq 'OK') { $f.FileName }\""
            )
            proc = subprocess.run(cmd, shell=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            if proc.returncode == 0:
                path = proc.stdout.strip()
                if path:
                    return path
            return None
        except Exception as e:
            print("Failed to open rules dialog via powershell:", e)

    # 3. Fallback to pywebview
    try:
        import webview
        if hasattr(webview, "windows") and webview.windows:
            win = webview.windows[0]
            res = win.create_file_dialog(
                dialogue_type=webview.OPEN_DIALOG,
                file_types=('Archivos de Reglas (*.txt;*.md;*.docx)', 'Documento de Word (*.docx)', 'Texto Plano (*.txt;*.md)', 'Todos (*.*)')
            )
            if res:
                return res[0] if isinstance(res, (list, tuple)) else res
            return None
    except Exception as e:
        print("Failed to open rules dialog via pywebview:", e)
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
    key = schema.get("gemini_api_key", "").strip()
    if key:
        return key
    return os.environ.get("GEMINI_API_KEY", "").strip() or os.environ.get("GOOGLE_API_KEY", "").strip()

def call_gemini_api(prompt, api_key):
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key={api_key}"
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
        with urllib.request.urlopen(req, timeout=3) as response:
            res_body = response.read().decode("utf-8")
            res_json = json.loads(res_body)
            candidate = res_json["candidates"][0]
            text = candidate["content"]["parts"][0]["text"]
            return json.loads(text)
    except Exception as e:
        print("Error calling Gemini API:", e)
        return None

def heal_schema_locally(current_headers, old_schema):
    """
    Deterministically aligns old schema columns with new Excel headers,
    and automatically registers any new columns using local rules.
    """
    import re
    import openpyxl.utils

    updated_schema = dict(old_schema)
    old_columns = old_schema.get("columns", [])
    
    # Map old columns by header (case-insensitive, stripped)
    old_by_header = {}
    for col in old_columns:
        h = col.get("header")
        if h:
            old_by_header[str(h).strip().upper()] = col

    new_columns = []
    seen_fields = set()

    def clean_field_name(header_str, index):
        # Convert header to a valid snake_case field name
        s = header_str.lower().strip()
        s = re.sub(r"[^\w\s-]", "", s)
        s = re.sub(r"[\s-]+", "_", s)
        s = s.strip("_")
        if not s:
            return f"col_{index}"
        # Avoid duplicate fields
        orig = s
        counter = 1
        while s in seen_fields:
            s = f"{orig}_{counter}"
            counter += 1
        return s

    for idx, h_raw in enumerate(current_headers):
        h_str = str(h_raw).strip() if h_raw is not None else ""
        
        h_upper = h_str.upper()
        col_idx = idx + 1
        letter = openpyxl.utils.get_column_letter(col_idx)

        # Check if this header already exists in old schema
        if h_str and h_upper in old_by_header:
            # Re-align existing column
            col = dict(old_by_header[h_upper])
            col["index"] = col_idx
            col["letter"] = letter
            new_columns.append(col)
            seen_fields.add(col["field"])
        else:
            # This is a NEW or empty column!
            # If it's completely empty, check if we can reuse an existing column from old_schema that has an empty header
            old_col_at_idx = None
            for col in old_columns:
                if col.get("index") == col_idx and (col.get("header") is None or str(col.get("header")).strip() == ""):
                    old_col_at_idx = col
                    break
            
            if old_col_at_idx:
                col = dict(old_col_at_idx)
                col["index"] = col_idx
                col["letter"] = letter
                new_columns.append(col)
                seen_fields.add(col["field"])
            else:
                field_name = clean_field_name(h_str, col_idx)
                seen_fields.add(field_name)

                # Determine type and category based on header text
                category = "metadata"
                col_type = "string"
                editable = True
                incidence_editable = False

                h_lower = h_str.lower()
                # Simple heuristic matching
                if h_str:
                    if any(x in h_lower for x in ["fecha", "ingreso", "baja"]):
                        col_type = "date"
                    elif any(x in h_lower for x in ["cuenta", "activo", "s/n", "si/no"]):
                        col_type = "boolean"
                    elif any(x in h_lower for x in ["descuento", "deuda", "prestamo", "abono"]):
                        col_type = "float"
                        category = "deduction"
                        incidence_editable = True
                    elif any(x in h_lower for x in ["total", "suma", "sdi", "puntualidad", "asistencia", "nominal", "integracion", "acumulado", "bruto"]):
                        col_type = "float"
                        category = "calculated"
                        editable = False
                    elif any(x in h_lower for x in ["diario", "sueldo"]):
                        col_type = "float"
                        category = "nominal_imss"
                    elif any(x in h_lower for x in ["gasolina", "combustible", "bono", "comision", "efectivo", "facturado", "asimilados", "socio"]):
                        col_type = "float"
                        category = "others"
                    elif any(x in h_lower for x in ["monto", "pago", "cantidad", "pesos", "$", "%"]):
                        col_type = "float"
                        category = "others"

                new_col = {
                    "index": col_idx,
                    "letter": letter,
                    "header": h_str if h_str else None,
                    "field": field_name,
                    "type": col_type,
                    "category": category,
                    "label": h_str if h_str else f"Columna {letter}",
                    "editable": editable if h_str else False,
                    "incidence_editable": incidence_editable
                }
                new_columns.append(new_col)
                print(f"Locally detected and added column: {h_str or 'VACIA'} (field: {field_name}, category: {category})")

                # If we defaulted to metadata but it could be a monetary field, ask the user
                if h_str and category == "metadata" and col_type == "string":
                    if "pending_clarifications" not in updated_schema:
                        updated_schema["pending_clarifications"] = []
                    
                    # Avoid duplicates
                    if not any(q.get("field") == field_name for q in updated_schema["pending_clarifications"]):
                        updated_schema["pending_clarifications"].append({
                            "field": field_name,
                            "question": f"He detectado una nueva columna '{h_str}'. ¿Cómo debe procesarse en la prenómina?",
                            "options": [
                                "Es una Deducción (Descuento)",
                                "Es una Percepción Adicional",
                                "Solo es texto informativo"
                            ]
                        })

    # Sort columns by index
    updated_schema["columns"] = sorted(new_columns, key=lambda x: x["index"])
    return updated_schema

def heal_schema_with_ai(current_headers, old_schema):
    api_key = get_gemini_api_key(old_schema)
    if not api_key:
        print("Gemini API Key is missing. Performing local deterministic schema healing.")
        updated_schema = heal_schema_locally(current_headers, old_schema)
        # Create a pending clarification to guide the user to configure key for advanced AI healing
        updated_schema["pending_clarifications"] = [{
            "field": "gemini_api_key",
            "question": "Se han detectado cambios en las cabeceras de Excel, pero no hay una GEMINI_API_KEY configurada. Se han alineado las columnas de forma local, pero puedes introducir tu clave en Configuración para usar la clasificación inteligente.",
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
        print("AI Schema healing failed or timed out. Falling back to local deterministic schema healing.")
        return heal_schema_locally(current_headers, old_schema)

def check_and_heal_schema():
    schema = load_schema()
    excel_path = get_excel_path()
    if not os.path.exists(excel_path):
        return schema
    try:
        wb = load_workbook_agnostic(excel_path, data_only=True)
        ws = wb.active
        headers_row = find_headers_row(ws)
        current_headers = []
        for col_idx in range(1, ws.max_column + 1):
            val = ws.cell(row=headers_row, column=col_idx).value
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
        elif path_only == "/api/select-rules-file":
            self.select_rules_file()
        else:
            super().do_GET()

    def do_POST(self):
        path_only = self.path.split("?")[0]
        content_length = int(self.headers.get('Content-Length', 0))
        post_data = self.rfile.read(content_length) if content_length > 0 else b""

        if path_only == "/api/parse-docx":
            self.parse_docx_endpoint(post_data)
            return

        try:
            body = json.loads(post_data.decode("utf-8")) if post_data else {}
        except Exception as e:
            self.send_json({"error": f"Invalid JSON: {e}"}, 400)
            return

        if path_only == "/api/collaborator":
            self.save_collaborator(body)
        elif path_only == "/api/incidences":
            self.save_incidences(body)
        elif path_only == "/api/config":
            self.save_config(body)
        elif path_only == "/api/schema/clarify":
            self.save_clarify(body)
        elif path_only == "/api/payroll/explain":
            self.explain_payroll(body)
        else:
            self.send_json({"error": "Endpoint not found"}, 404)

    def parse_docx_endpoint(self, post_data):
        try:
            import zipfile
            import xml.etree.ElementTree as ET
            import io
            
            if not post_data:
                self.send_json({"error": "Empty body"}, 400)
                return

            with zipfile.ZipFile(io.BytesIO(post_data)) as z:
                doc_xml = z.read('word/document.xml')
                root = ET.fromstring(doc_xml)
                
                paragraphs = []
                for elem in root.iter():
                    tag_name = elem.tag.split('}')[-1]
                    if tag_name == 'p':
                        p_text = []
                        for child in elem.iter():
                            child_tag = child.tag.split('}')[-1]
                            if child_tag == 't' and child.text:
                                p_text.append(child.text)
                        text_str = "".join(p_text).strip()
                        if text_str:
                            paragraphs.append(text_str)
                extracted_text = "\n\n".join(paragraphs)
            self.send_json({"text": extracted_text})
        except Exception as e:
            self.send_json({"error": f"Failed to parse docx file: {e}"}, 500)

    def get_schema(self):
        schema = check_and_heal_schema()
        self.send_json(schema)

    def select_file(self):
        path = select_file_via_dialog()
        self.send_json({"selected_path": path})

    def select_rules_file(self):
        path = select_rules_file_via_dialog()
        if not path:
            self.send_json({"text": None})
            return
            
        try:
            ext = path.split('.')[-1].lower()
            if ext == "docx":
                with open(path, 'rb') as f:
                    data_bytes = f.read()
                import zipfile
                import xml.etree.ElementTree as ET
                import io
                with zipfile.ZipFile(io.BytesIO(data_bytes)) as z:
                    doc_xml = z.read('word/document.xml')
                    root = ET.fromstring(doc_xml)
                    paragraphs = []
                    for elem in root.iter():
                        tag_name = elem.tag.split('}')[-1]
                        if tag_name == 'p':
                            p_text = []
                            for child in elem.iter():
                                child_tag = child.tag.split('}')[-1]
                                if child_tag == 't' and child.text:
                                    p_text.append(child.text)
                            text_str = "".join(p_text).strip()
                            if text_str:
                                paragraphs.append(text_str)
                    extracted_text = "\n\n".join(paragraphs)
            elif ext in ["txt", "md"]:
                with open(path, 'r', encoding='utf-8', errors='ignore') as f:
                    extracted_text = f.read()
            else:
                self.send_json({"error": "Formato de archivo no soportado. Por favor, selecciona un archivo .txt, .md o .docx."}, 400)
                return
                
            self.send_json({"selected_path": path, "text": extracted_text})
        except Exception as e:
            self.send_json({"error": f"Error al leer el archivo de reglas: {e}"}, 500)

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
                    col["type"] = "float"
                elif "percepción" in answer.lower():
                    col["category"] = "others"
                    col["editable"] = True
                    col["type"] = "float"
                print(f"Applied clarification for {field}: categorized as {col['category']}")
        
        # Remove from pending list
        if "pending_clarifications" in schema:
            schema["pending_clarifications"] = [q for q in schema["pending_clarifications"] if q.get("field") != field]
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
            headers_row = find_headers_row(sheet_v)
            row = headers_row + 1
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
            headers_row = find_headers_row(ws)
            row = headers_row + 1
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
                    ws.cell(row=new_totals_row, column=col_idx).value = f"=SUM({letter}{headers_row + 1}:{letter}{new_totals_row-1})"
            
            # AC and AG sum
            bruto_quincenal_col = get_field_index(schema, "bruto_quincenal")
            if bruto_quincenal_col:
                ws.cell(row=new_totals_row, column=bruto_quincenal_col).value = f"={bruto_mensual_neto_letter}{new_totals_row}/2"
            if neto_quincenal_col:
                neto_quincenal_letter = get_field_letter(schema, "neto_quincenal")
                ws.cell(row=new_totals_row, column=neto_quincenal_col).value = f"=SUM({neto_quincenal_letter}{headers_row + 1}:{neto_quincenal_letter}{new_totals_row-1})"

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

            headers_row = find_headers_row(ws)
            row = headers_row + 1
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

            # Apply bonuses overrides if present in payload
            sdi_letter = get_field_letter(schema, "sdi")
            if "puntualidad" in body:
                puntualidad_col = get_field_index(schema, "puntualidad")
                if puntualidad_col:
                    p_val = body["puntualidad"]
                    if p_val in ["NO", False, 0, "NO_FORMULA"]:
                        ws.cell(row=found_row, column=puntualidad_col).value = 0.0
                    else:
                        ws.cell(row=found_row, column=puntualidad_col).value = f"={sdi_letter}{found_row}*0.1*$N$3"

            if "asistencia" in body:
                asistencia_col = get_field_index(schema, "asistencia")
                if asistencia_col:
                    a_val = body["asistencia"]
                    if a_val in ["NO", False, 0, "NO_FORMULA"]:
                        ws.cell(row=found_row, column=asistencia_col).value = 0.0
                    else:
                        ws.cell(row=found_row, column=asistencia_col).value = f"={sdi_letter}{found_row}*0.1*$N$3"

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
            payroll_rules = body.get("payroll_rules", "")

            schema = load_schema()
            schema["gemini_api_key"] = api_key
            schema["uma_cell"] = "S3"
            schema["vales_pct_cell"] = "P3"
            schema["dias_mes_cell"] = "N3"
            schema["fa_pct_cell"] = "L3"
            schema["aguinaldo_cell"] = "J3"
            schema["prima_cell"] = "H3"
            schema["payroll_rules"] = payroll_rules
            
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

    def explain_payroll(self, body):
        try:
            schema = check_and_heal_schema()
            excel_path = get_excel_path()
            if not os.path.exists(excel_path):
                self.send_json({"error": "Database file not found"}, 500)
                return

            cod = body.get("employee_id")
            if not cod:
                self.send_json({"error": "Employee ID is required"}, 400)
                return

            chat_history = body.get("chat_history", [])
            new_message = body.get("new_message", "")

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

            # Find employee row
            nombre_col = get_field_index(schema, "nombre")
            id_col = get_field_index(schema, "id")

            headers_row = find_headers_row(sheet_v)
            row = headers_row + 1
            found_row = None
            is_temp_id = isinstance(cod, str) and cod.startswith("TEMP_")
            temp_row_resolved = None
            if is_temp_id:
                try:
                    temp_row_resolved = int(cod.split("_")[1])
                except ValueError:
                    pass

            while True:
                nombre_val = sheet_v.cell(row=row, column=nombre_col).value
                cod_val = sheet_v.cell(row=row, column=id_col).value
                
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
                self.send_json({"error": f"Colaborador con Cód. {cod} no encontrado"}, 404)
                wb_v.close()
                wb_f.close()
                return

            def val_to_float(cell_val):
                if cell_val is None: return 0.0
                v = str(cell_val).replace(",", "").strip()
                if v in ["-", "", "None"]: return 0.0
                try: return float(v)
                except ValueError: return 0.0

            # Read employee data
            emp_data = {}
            for col in schema["columns"]:
                f = col["field"]
                t = col["type"]
                val = sheet_v.cell(row=found_row, column=col["index"]).value
                if t == "float":
                    emp_data[f] = val_to_float(val)
                elif t == "boolean":
                    emp_data[f] = str(val or "").upper() == "SI"
                else:
                    emp_data[f] = str(val or "").strip()

            # Resolve absences (faltas)
            faltas = 0
            neto_quincenal_col = get_field_index(schema, "neto_quincenal")
            if neto_quincenal_col:
                formula_ag = sheet_f.cell(row=found_row, column=neto_quincenal_col).value
                if isinstance(formula_ag, str) and "/15*" in formula_ag:
                    try:
                        parts = formula_ag.split("*")
                        days_worked = int(parts[-1])
                        faltas = 15 - days_worked
                    except:
                        pass

            wb_v.close()
            wb_f.close()

            # Basic math fields
            nombre = emp_data.get("nombre", "Sin Nombre")
            salario_diario = emp_data.get("salario_diario", 0.0)
            fi = emp_data.get("factor_integracion", 1.0493)
            sdi = emp_data.get("sdi", 0.0)
            sueldo_nominal = emp_data.get("sueldo_nominal", 0.0)
            puntualidad = emp_data.get("puntualidad", 0.0)
            asistencia = emp_data.get("asistencia", 0.0)
            vales_despensa = emp_data.get("vales_despensa", 0.0)
            fondo_ahorro = emp_data.get("fondo_ahorro", 0.0)
            fondo_ahorro_activo = "SI" if emp_data.get("fondo_ahorro_activo", False) else "NO"
            percepcion_sueldos = emp_data.get("percepcion_sueldos", 0.0)
            
            asimilados = emp_data.get("asimilados", 0.0)
            gasolina = emp_data.get("gasolina", 0.0)
            socio = emp_data.get("socio", 0.0)
            efectivo = emp_data.get("efectivo", 0.0)
            facturado = emp_data.get("facturado", 0.0)
            deuda_carro = emp_data.get("deuda_carro", 0.0)
            total_otros = asimilados + gasolina + socio + efectivo + facturado
            bruto_mensual = percepcion_sueldos + total_otros
            bruto_quincenal = bruto_mensual / 2
            
            descuento_faltas = (bruto_quincenal / 15.0) * faltas if faltas > 0 else 0.0
            descuento_adicional = emp_data.get("descuento_adicional", 0.0)
            neto_quincenal = max(0.0, bruto_quincenal - descuento_faltas - descuento_adicional - deuda_carro)

            # Determine entry and years completed
            ingreso_str = emp_data.get("ingreso", "")
            years_of_labores = 0.0
            vac = 12
            if ingreso_str:
                try:
                    ingreso_dt = datetime.strptime(ingreso_str, "%Y-%m-%d")
                    active_dt = datetime(2026, 4, 30)
                    years_of_labores = (active_dt - ingreso_dt).days / 365.25
                    y = max(1, int(years_of_labores))
                    if y <= 1: vac = 12
                    elif y == 2: vac = 14
                    elif y == 3: vac = 16
                    elif y == 4: vac = 18
                    elif y == 5: vac = 20
                    elif y <= 10: vac = 22
                    elif y <= 15: vac = 24
                    elif y <= 20: vac = 26
                    else: vac = 28
                except:
                    pass

            # Check if custom company rules are defined
            custom_rules = schema.get("payroll_rules", "").strip()
            rules_source = "custom" if custom_rules else "official"
            
            if custom_rules:
                rules_to_use = f"Reglas privadas/particulares de la empresa:\n{custom_rules}"
            else:
                rules_to_use = (
                    "No se configuraron reglas privadas de la empresa. Se aplican las reglas contables oficiales estándar de la LFT (Ley Federal del Trabajo) en México:\n"
                    "- Factor de Integración = 1 + (Aguinaldo / 365) + (Vacaciones * Prima_Vacacional / 365)\n"
                    "- Salario Diario Integrado (SDI) = Salario Diario * Factor de Integración\n"
                    "- Sueldo Nominal Mensual = Salario Diario * Días del Mes (Row 3)\n"
                    "- Premios de Asistencia y Puntualidad: 10% del SDI * Días del Mes cada uno\n"
                    "- Vales de Despensa = UMA * Vales% * Días del Mes\n"
                    "- Fondo de Ahorro = Sueldo Nominal * FA% (si aplica)\n"
                    "- Sueldo Bruto Mensual = Total Percepciones + Otros Ingresos\n"
                    "- Sueldo Bruto Quincenal normal = Bruto Mensual / 2\n"
                    "- Descuento de Faltas proporcional = (Bruto Quincenal / 15) * Faltas\n"
                    "- Sueldo Neto Quincenal = Bruto Quincenal - Descuento de Faltas - Deducciones"
                )

            # Generate local markdown breakdown as fallback
            fa_status = f"Sí, activo ({fa_pct:.0f}%): Sueldo Nominal $\\times$ {fa_pct:.1f}% = ${fondo_ahorro:,.2f}" if (fondo_ahorro_activo == "SI" and fondo_ahorro > 0) else "No activo"
            fi_aguinaldo = aguinaldo / 365.0
            fi_prima = (vac * (prima / 100.0)) / 365.0
            
            local_desglose = f"""### 🤖 Explicación del Cálculo de Nómina Local (Offline)

*Nota: No hay una clave de API de Gemini válida configurada, por lo que se muestra el cálculo matemático local.*

**Colaborador:** {nombre} (Código: {cod})  
**Fecha de Ingreso:** {ingreso_str}  
**Antigüedad:** {years_of_labores:.2f} años ({vac} días de vacaciones según LFT)  

---

#### 1. Esquema Nominal IMSS (Base Fiscal)
- **Factor de Integración (FI):**
  $$\\text{{FI}} = 1 + \\frac{{\\text{{Aguinaldo}} ({aguinaldo:.0f} \\text{{ días}})}}{{365}} + \\frac{{\\text{{Vacaciones}} ({vac} \\text{{ días}}) \\times \\text{{Prima}} ({prima:.0f}\\%)}}{{365}}$$
  $$\\text{{FI}} = 1 + {fi_aguinaldo:.4f} + {fi_prima:.4f} = {fi:.4f}$$
- **Salario Diario Integrado (SDI):**
  $$\\text{{SDI}} = \\text{{Salario Diario}} (\\${salario_diario:,.2f}) \\times \\text{{FI}} ({fi:.4f}) = \\${sdi:,.2f}$$
- **Sueldo Nominal Mensual:**
  $$\\text{{Sueldo Nominal}} = \\text{{Salario Diario}} (\\${salario_diario:,.2f}) \\times \\text{{Días Mes}} ({dias_mes:.1f}) = \\${sueldo_nominal:,.2f}$$
- **Premios (10% de SDI):**
  - **Puntualidad:** $\\${puntualidad:,.2f}$
  - **Asistencia:** $\\${asistencia:,.2f}$
- **Vales de Despensa:**
  $$\\text{{Vales}} = \\text{{UMA}} (\\${uma:,.2f}) \\times \\text{{Vales\\%}} ({vales_pct:.0f}\\%) \\times \\text{{Días Mes}} ({dias_mes:.1f}) = \\${vales_despensa:,.2f}$$
- **Fondo de Ahorro:** {fa_status}
- **Total Percepciones Mensuales:** $\\${percepcion_sueldos:,.2f}$

---

#### 2. Otros Ingresos (Esquema Mixto)
- Asimilados: $\\${asimilados:,.2f}$ (Mensual)
- Gasolina: $\\${gasolina:,.2f}$ (Mensual)
- Pago Socio: $\\${socio:,.2f}$ (Mensual)
- Efectivo: $\\${efectivo:,.2f}$ (Mensual)
- Facturado: $\\${facturado:,.2f}$ (Mensual)
- **Total Otros Ingresos:** $\\${total_otros:,.2f}$ (Mensual)

---

#### 3. Cálculo de Prenómina Quincenal
- **Sueldo Bruto Mensual (Total):** $\\${bruto_mensual:,.2f}$
- **Sueldo Bruto Quincenal:** $\\${bruto_quincenal:,.2f}$
- **Ajustes / Descuentos por Incidencias:**
  - **Faltas ({faltas} días):** Descuento de $\\${descuento_faltas:,.2f}$ (basado en la fórmula: $\\frac{{\\text{{Bruto Quincenal}}}}{{15}} \\times {faltas}$)
  - **Descuento Adicional:** $\\${descuento_adicional:,.2f}$
  - **Deuda Carro (Deducción):** $\\${deuda_carro:,.2f}$
- **Sueldo Neto Quincenal Final:**
  $$\\text{{Neto}} = \\text{{Bruto Quincenal}} (\\${bruto_quincenal:,.2f}) - \\text{{Faltas}} (\\${descuento_faltas:,.2f}) - \\text{{Descuento Adicional}} (\\${descuento_adicional:,.2f}) - \\text{{Deuda Carro}} (\\${deuda_carro:,.2f}) = \\${neto_quincenal:,.2f}$$
"""

            # Try to use Gemini API if key is present
            api_key = get_gemini_api_key(schema)
            if not api_key:
                self.send_json({"response": local_desglose, "rules_source": rules_source, "offline": True})
                return

            # Build Gemini Prompt
            system_prompt = f"""Eres un experto en contabilidad de nómina mexicana y leyes laborales de la LFT (Ley Federal del Trabajo).
Tu tarea es explicar de manera clara, didáctica y detallada el cálculo de la prenómina quincenal de un colaborador, basándote en las siguientes constantes de configuración del sistema y en las reglas de cálculo de la empresa.

CONSTANTES DE CONFIGURACIÓN DEL SISTEMA:
- UMA (2026): ${uma:.2f}
- % exento de Vales de Despensa: {vales_pct}% de la UMA
- Días promedio del mes: {dias_mes}
- % Fondo de Ahorro: {fa_pct}%
- Días mínimos de Aguinaldo: {aguinaldo}
- % Prima Vacacional: {prima}%

REGLAS DE CÁLCULO DE LA EMPRESA APLICADAS:
{rules_to_use}

Cuando el usuario pida la explicación inicial o te pregunte sobre el colaborador, detalla paso a paso las operaciones matemáticas y cómo se llega a cada resultado.
Usa Markdown y tablas limpias para presentar la información. Presenta los números con formato de moneda.

INSTRUCCIONES DE ACTUALIZACIÓN DE BASE DE DATOS (INCIDENCIAS):
El usuario no solo te hará preguntas, sino que también puede darte instrucciones directas para modificar la prenómina de este colaborador en particular. Por ejemplo: "tuvo 2 faltas", "quítale el bono de puntualidad", "descuéntale $500 adicionales", "restablecer bono de asistencia", etc.
Si detectas que el usuario te está pidiendo aplicar cambios o incidencias al colaborador actual, debes realizar lo siguiente:
1. Explica brevemente en tu respuesta que vas a aplicar los cambios indicados en el sistema (por ejemplo: "Entendido, procedo a registrar 2 faltas y suspender el premio de puntualidad en el archivo Excel...").
2. Incluye al final de tu respuesta (después de todo el texto descriptivo) un bloque de código JSON con formato exacto que contenga las actualizaciones. Debe ser exactamente de la siguiente forma:

```json
{{
  "apply_changes": {{
    "faltas": 2, // Número entero de faltas a registrar (0 a 15), null si no cambia o si se quitan las faltas (poner 0 si se quitan)
    "descuento_adicional": 500.0, // Monto de descuento adicional (float), null si no cambia (poner 0 si se quita)
    "puntualidad": "NO", // "NO" para suspenderlo (poner 0), "SI" para activarlo con su fórmula normal, null si no cambia
    "asistencia": "NO", // "NO" para suspenderlo (poner 0), "SI" para activarlo con su fórmula normal, null si no cambia
    "observaciones": "Descuento de 2 faltas y bono de puntualidad por inasistencia." // Breve justificación que se escribirá en observaciones, null si no cambia
  }}
}}
```

IMPORTANTE:
- Solo incluye este bloque JSON si el mensaje del usuario representa una instrucción clara de cambio de datos. Si solo es una consulta de información o una pregunta general, NO incluyes el bloque "apply_changes".
- El bloque JSON debe estar en una sección separada al final con la sintaxis de código de markdown de triple backtick.
"""

            # Build contents payload
            contents = []
            
            # Map input chat_history to contents
            for msg in chat_history:
                role = msg.get("role")
                text = msg.get("text", "")
                if text:
                    contents.append({
                        "role": "user" if role == "user" else "model",
                        "parts": [{"text": text}]
                    })

            # Handle user request
            if new_message:
                contents.append({
                    "role": "user",
                    "parts": [{"text": f"Pregunta sobre {nombre} ({cod}): {new_message}"}]
                })
            else:
                collab_details = f"""Por favor, genera la explicación inicial y detallada del cálculo de prenómina para este colaborador:
DATOS DEL COLABORADOR:
- Nombre: {nombre}
- Código: {cod}
- Salario Diario: ${salario_diario:,.2f}
- Fecha de Ingreso: {ingreso_str}
- Antigüedad: {years_of_labores:.2f} años ({vac} días de vacaciones según LFT)
- Cuenta con Fondo de Ahorro: {fondo_ahorro_activo}
- Faltas registradas en la quincena: {faltas}

VALORES REGISTRADOS EN EXCEL:
- Salario Diario: ${salario_diario:,.2f}
- Factor de Integración: {fi:.4f}
- Salario Diario Integrado (SDI): ${sdi:,.2f}
- Sueldo Nominal Mensual: ${sueldo_nominal:,.2f}
- Premio de Puntualidad Mensual: ${puntualidad:,.2f}
- Premio de Asistencia Mensual: ${asistencia:,.2f}
- Vales de Despensa Mensual: ${vales_despensa:,.2f}
- Fondo de Ahorro Mensual: ${fondo_ahorro:,.2f}
- Total Percepciones Mensual: ${percepcion_sueldos:,.2f}
- Asimilados Mensual: ${asimilados:,.2f}
- Gasolina Mensual: ${gasolina:,.2f}
- Pago Socio Mensual: ${socio:,.2f}
- Efectivo Mensual: ${efectivo:,.2f}
- Facturado Mensual: ${facturado:,.2f}
- Abono Carro (Deducción) Mensual: ${deuda_carro:,.2f}
- Total Otros Ingresos Mensual: ${total_otros:,.2f}
- Sueldo Bruto Mensual: ${bruto_mensual:,.2f}
- Sueldo Bruto Quincenal base: ${bruto_quincenal:,.2f}
- Descuento por Faltas en Quincena: ${descuento_faltas:,.2f}
- Descuento Adicional en Quincena: ${descuento_adicional:,.2f}
- Sueldo Neto Quincenal Final: ${neto_quincenal:,.2f}
"""
                contents.append({
                    "role": "user",
                    "parts": [{"text": collab_details}]
                })

            # Call Gemini Chat API
            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key={api_key}"
            req_data = {
                "contents": contents,
                "systemInstruction": {
                    "parts": [{"text": system_prompt}]
                }
            }
            headers = {"Content-Type": "application/json"}
            data = json.dumps(req_data).encode("utf-8")
            req = urllib.request.Request(url, data=data, headers=headers, method="POST")
            
            try:
                with urllib.request.urlopen(req, timeout=40) as response:
                    res_body = response.read().decode("utf-8")
                    res_json = json.loads(res_body)
                    candidate = res_json["candidates"][0]
                    text = candidate["content"]["parts"][0]["text"]
                    
                    # Parse apply_changes from response text
                    applied_changes = False
                    try:
                        import re
                        # Robustly try to find a JSON block even if missing ```json
                        json_str = None
                        m = re.search(r"```(?:json)?\s*(.*?)\s*```", text, re.DOTALL)
                        if m:
                            json_str = m.group(1).strip()
                        else:
                            # Try to find { "apply_changes": ... } inside the text directly
                            m_direct = re.search(r"(\{.*?\"apply_changes\".*?\})", text, re.DOTALL)
                            if m_direct:
                                json_str = m_direct.group(1).strip()
                        
                        if json_str:
                            changes_data = json.loads(json_str)
                            if "apply_changes" in changes_data:
                                changes = changes_data["apply_changes"]
                                
                                # Open workbook to apply changes
                                wb = load_workbook_agnostic(excel_path, data_only=False)
                                ws = wb.active
                                
                                # Find employee row
                                nombre_col = get_field_index(schema, "nombre")
                                id_col = get_field_index(schema, "id")
                                headers_row = find_headers_row(ws)
                                row = headers_row + 1
                                found_row = None
                                is_temp_id = isinstance(cod, str) and cod.startswith("TEMP_")
                                temp_row_resolved = None
                                if is_temp_id:
                                    try: temp_row_resolved = int(cod.split("_")[1])
                                    except ValueError: pass

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

                                if found_row:
                                    # 1. Update Faltas
                                    faltas = changes.get("faltas")
                                    neto_quincenal_col = get_field_index(schema, "neto_quincenal")
                                    bruto_mensual_neto_letter = get_field_letter(schema, "bruto_mensual_neto")
                                    if faltas is not None and neto_quincenal_col:
                                        try:
                                            faltas = int(faltas)
                                            if faltas > 0:
                                                dias_laborados = 15 - faltas
                                                ws.cell(row=found_row, column=neto_quincenal_col).value = f"={bruto_mensual_neto_letter}{found_row}/2/15*{dias_laborados}"
                                            else:
                                                ws.cell(row=found_row, column=neto_quincenal_col).value = f"={bruto_mensual_neto_letter}{found_row}/2"
                                        except ValueError:
                                            pass

                                    # 2. Update Descuento Adicional
                                    desc = changes.get("descuento_adicional")
                                    descuento_col = get_field_index(schema, "descuento_adicional")
                                    if desc is not None and descuento_col:
                                        try:
                                            desc = float(desc)
                                            ws.cell(row=found_row, column=descuento_col).value = desc if desc > 0 else None
                                        except ValueError:
                                            pass

                                    # 3. Update Observaciones
                                    obs = changes.get("observaciones")
                                    observaciones_col = get_field_index(schema, "observaciones")
                                    if obs is not None and observaciones_col:
                                        ws.cell(row=found_row, column=observaciones_col).value = str(obs) if obs else None

                                    # 4. Update Puntualidad
                                    punt = changes.get("puntualidad")
                                    puntualidad_col = get_field_index(schema, "puntualidad")
                                    sdi_letter = get_field_letter(schema, "sdi")
                                    if punt is not None and puntualidad_col:
                                        if str(punt).upper() in ["NO", "NO_FORMULA"] or punt is False or punt == 0:
                                            ws.cell(row=found_row, column=puntualidad_col).value = 0.0
                                        elif str(punt).upper() in ["SI", "FORMULA"] or punt is True:
                                            ws.cell(row=found_row, column=puntualidad_col).value = f"={sdi_letter}{found_row}*0.1*$N$3"

                                    # 5. Update Asistencia
                                    asist = changes.get("asistencia")
                                    asistencia_col = get_field_index(schema, "asistencia")
                                    if asist is not None and asistencia_col:
                                        if str(asist).upper() in ["NO", "NO_FORMULA"] or asist is False or asist == 0:
                                            ws.cell(row=found_row, column=asistencia_col).value = 0.0
                                        elif str(asist).upper() in ["SI", "FORMULA"] or asist is True:
                                            ws.cell(row=found_row, column=asistencia_col).value = f"={sdi_letter}{found_row}*0.1*$N$3"

                                    save_workbook_agnostic(wb, excel_path)
                                    applied_changes = True
                                wb.close()
                    except Exception as parse_e:
                        print("Error parsing and applying changes from Gemini:", parse_e)

                    self.send_json({"response": text, "rules_source": rules_source, "offline": False, "applied_changes": applied_changes})
            except Exception as e:
                print("Gemini API call failed, falling back to local:", e)
                self.send_json({"response": local_desglose, "rules_source": rules_source, "offline": True})

        except Exception as e:
            tb = traceback.format_exc()
            print("Error in explain_payroll endpoint:\n", tb)
            self.send_json({"error": f"Error explaining payroll: {e}", "details": tb}, 500)

if __name__ == "__main__":
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), APIHandler) as httpd:
        print(f"Serving RHM CRM & Prenómina on port {PORT}...")
        httpd.serve_forever()
