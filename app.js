
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
// RHM CRM & Prenómina App Logic (Dynamic AI-Connected Edition)

// Global Fetch Interceptor for Authentication
(function() {
  const originalFetch = window.fetch;
  window.fetch = async function(resource, init) {
    const token = localStorage.getItem("rhm_session_token");
    if (token) {
      init = init || {};
      init.headers = init.headers || {};
      if (init.headers instanceof Headers) {
        init.headers.set("Authorization", `Bearer ${token}`);
      } else if (Array.isArray(init.headers)) {
        const hasAuth = init.headers.some(h => h[0] === "Authorization");
        if (!hasAuth) {
          init.headers.push(["Authorization", `Bearer ${token}`]);
        }
      } else {
        init.headers["Authorization"] = `Bearer ${token}`;
      }
    }
    const response = await originalFetch(resource, init);
    if (response.status === 401 && !resource.toString().includes("/api/login")) {
      // Session expired or invalid
      localStorage.removeItem("rhm_session_token");
      localStorage.removeItem("rhm_user_role");
      localStorage.removeItem("rhm_username");
      showLoginScreen();
    }
    return response;
  };
})();

function showLoginScreen() {
  const loginScreen = document.getElementById("login-screen");
  if (loginScreen) {
    loginScreen.style.display = "flex";
  }
}

function hideLoginScreen() {
  const loginScreen = document.getElementById("login-screen");
  if (loginScreen) {
    loginScreen.style.display = "none";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  
  // Helper functions for AI configuration status
  function toggleAIProviderModels(provider) {
    const modelSelect = document.getElementById("cfg-ai-model-select");
    const modelGroup = document.getElementById("cfg-ai-model-group");
    const customGroup = document.getElementById("cfg-ai-model-custom-group");
    const keyGroup = document.getElementById("cfg-ai-status-group");
    
    if (provider === "none") {
      if (modelGroup) modelGroup.style.display = "none";
      if (customGroup) customGroup.style.display = "none";
      if (keyGroup) keyGroup.style.display = "none";
      return;
    }
    
    if (modelGroup) modelGroup.style.display = "";
    if (keyGroup) keyGroup.style.display = "";
    
    if (!modelSelect) return;
    const options = modelSelect.options;
    
    for (let i = 0; i < options.length; i++) {
      const opt = options[i];
      if (opt.value === "custom") continue;
      
      const isOrOption = opt.classList.contains("or-option");
      if (provider === "openrouter") {
        if (isOrOption) {
          opt.style.display = "";
        } else {
          opt.style.display = "none";
        }
      } else {
        if (isOrOption) {
          opt.style.display = "none";
        } else {
          opt.style.display = "";
        }
      }
    }
    
    if (customGroup) {
      customGroup.style.display = modelSelect.value === "custom" ? "flex" : "none";
    }
  }

  function updateAIStatusUI() {
    fetch("/api/ai-status?_t=" + Date.now())
      .then(res => res.json())
      .then(data => {
        const badge = document.getElementById("ai-key-status-badge");
        const chatInput = document.getElementById("ai-chat-input");
        const chatSend = document.getElementById("btn-ai-chat-send");
        
        if (badge) {
          if (data.configured) {
            badge.className = "badge success";
            badge.innerHTML = `<span class="pulse-dot success" id="ai-status-pulse"></span> <span id="ai-status-text">Activo / Variable Detectada</span>`;
            if (chatInput) chatInput.disabled = false;
            if (chatSend) chatSend.disabled = false;
          } else {
            badge.className = "badge danger";
            badge.innerHTML = `<span class="pulse-dot danger" id="ai-status-pulse"></span> <span id="ai-status-text">Inactivo / Sin Variable</span>`;
            if (chatInput) chatInput.disabled = true;
            if (chatSend) chatSend.disabled = true;
          }
          if (window.lucide) lucide.createIcons();
        }
      })
      .catch(err => console.error("Error fetching AI status:", err));
  }

  // 1. Initial State & Configuration
  const DEFAULT_CONFIG = {
    uma: 117.31,
    valesPct: 40,
    diasMes: 30.4,
    faPct: 11,
    aguinaldo: 15,
    prima: 25
  };

  let state = {
    employees: [],
    schema: null,
    config: { ...DEFAULT_CONFIG },
    activeTab: "dashboard",
    selectedIncidenceEmployeeId: null,
    period: "16 al 30 Abr 2026",
    currentEmployeeIncidences: [],
    companies: [],
    filterEmployeeIds: null
  };

  function isPeriodStrMonthly(periodStr) {
    if (!periodStr) return false;
    const match = periodStr.match(/(\d+)\s+al\s+(\d+)\s+(\w+)\s+(\d{4})/i);
    if (match) {
      const startDay = parseInt(match[1]);
      const endDay = parseInt(match[2]);
      return startDay === 1 && endDay > 15;
    }
    return false;
  }

  function getPeriodDaysCount(periodStr) {
    if (!periodStr) return 15;
    const match = periodStr.match(/(\d+)\s+al\s+(\d+)\s+(\w+)\s+(\d{4})/i);
    if (match) {
      const startDay = parseInt(match[1]);
      const endDay = parseInt(match[2]);
      return endDay - startDay + 1;
    }
    return 15;
  }

  function getDaysInMonth(year, monthIndex) {
    return new Date(year, monthIndex + 1, 0).getDate();
  }

  function populatePeriodDropdown(type, activePeriod) {
    const periodSelect = document.getElementById("period-select");
    if (!periodSelect) return;
    
    let year = 2026;
    if (activePeriod) {
      const match = activePeriod.match(/\d{4}/);
      if (match) year = parseInt(match[0]);
    }
    
    const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
    periodSelect.innerHTML = "";
    
    if (type === "mensual") {
      months.forEach((m, idx) => {
        const lastDay = getDaysInMonth(year, idx);
        const val = `1 al ${lastDay} ${m} ${year}`;
        const option = document.createElement("option");
        option.value = val;
        option.textContent = val;
        periodSelect.appendChild(option);
      });
    } else {
      months.forEach((m, idx) => {
        const val1 = `1 al 15 ${m} ${year}`;
        const option1 = document.createElement("option");
        option1.value = val1;
        option1.textContent = val1;
        periodSelect.appendChild(option1);
        
        const lastDay = getDaysInMonth(year, idx);
        const val2 = `16 al ${lastDay} ${m} ${year}`;
        const option2 = document.createElement("option");
        option2.value = val2;
        option2.textContent = val2;
        periodSelect.appendChild(option2);
      });
    }
    
    let found = false;
    for (let i = 0; i < periodSelect.options.length; i++) {
      if (periodSelect.options[i].value === activePeriod) {
        periodSelect.value = activePeriod;
        found = true;
        break;
      }
    }
    
    if (!found && periodSelect.options.length > 0) {
      let monthStr = "";
      if (activePeriod) {
        const parts = activePeriod.split(" ");
        const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
        const foundMonth = parts.find(p => months.some(m => p.toLowerCase().startsWith(m.toLowerCase())));
        if (foundMonth) {
          monthStr = foundMonth;
        }
      }
      
      let matchedIdx = 0;
      if (monthStr) {
        for (let i = 0; i < periodSelect.options.length; i++) {
          if (periodSelect.options[i].value.includes(monthStr)) {
            matchedIdx = i;
            break;
          }
        }
      }
      periodSelect.selectedIndex = matchedIdx;
      state.period = periodSelect.value;
    }
  }

  function saveSelectedPeriod(newPeriod) {
    return fetch("/api/period", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ period: newPeriod })
    })
    .then(res => res.json())
    .then(data => {
      if (data.error) {
        showToast(data.error, "error");
        throw new Error(data.error);
      }
      showToast("Periodo actualizado con éxito: " + newPeriod, "success");
      return loadState();
    })
    .catch(err => {
      console.error("Error saving period:", err);
      showToast("Error al guardar el periodo", "error");
    });
  }

  let periodControlsInitialized = false;
  function initPeriodControls() {
    if (periodControlsInitialized) return;

    const btnQuincenal = document.getElementById("btn-period-quincenal");
    const btnMensual = document.getElementById("btn-period-mensual");
    const periodSelect = document.getElementById("period-select");
    
    if (btnQuincenal && btnMensual) {
      btnQuincenal.addEventListener("click", () => {
        if (btnQuincenal.classList.contains("active")) return;
        btnQuincenal.classList.add("active");
        btnMensual.classList.remove("active");
        
        populatePeriodDropdown("quincenal", state.period);
        const activeSelect = document.getElementById("period-select");
        saveSelectedPeriod(activeSelect ? activeSelect.value : "");
      });
      
      btnMensual.addEventListener("click", () => {
        if (btnMensual.classList.contains("active")) return;
        btnMensual.classList.add("active");
        btnQuincenal.classList.remove("active");
        
        populatePeriodDropdown("mensual", state.period);
        const activeSelect = document.getElementById("period-select");
        saveSelectedPeriod(activeSelect ? activeSelect.value : "");
      });
    }
    
    if (periodSelect) {
      periodSelect.addEventListener("change", (e) => {
        saveSelectedPeriod(e.target.value);
      });
    }
    
    periodControlsInitialized = true;
  }

  // 2. Load State from Python API
  function loadState() {
    const dbIndicator = document.getElementById("db-status-indicator");
    if (dbIndicator) {
      dbIndicator.className = "badge warning";
      dbIndicator.innerHTML = '<i data-lucide="refresh-cw" style="width: 16px; height: 16px; animation: spin 1.5s linear infinite;"></i>';
      dbIndicator.title = "Conectando con base de datos...";
      if (window.lucide) lucide.createIcons();
    }

    // Fetch dynamic schema configuration first
    return fetch("/api/schema?_t=" + Date.now())
      .then(res => {
        if (!res.ok) throw new Error("Error cargando esquema");
        return res.json();
      })
      .then(schemaData => {
        state.schema = schemaData;
        
        // Populate AI configuration fields
        const providerSelect = document.getElementById("cfg-ai-provider");
        const modelSelect = document.getElementById("cfg-ai-model-select");
        const modelCustomGroup = document.getElementById("cfg-ai-model-custom-group");
        const modelCustomInput = document.getElementById("cfg-ai-model-custom");
        
        if (providerSelect) {
          const provider = schemaData.ai_provider || "google";
          providerSelect.value = provider;
          toggleAIProviderModels(provider);
          
          if (modelSelect) {
            let model = schemaData.ai_model || "gemini-2.5-flash";
            if (model === "gemini-2.0-flash") model = "gemini-2.5-flash";
            else if (model === "gemini-2.0-pro") model = "gemini-2.5-pro";
            else if (model === "google/gemini-2.0-flash") model = "google/gemini-2.5-flash";
            else if (model === "google/gemini-2.0-pro") model = "google/gemini-2.5-pro";

            // Check if model exists as an option
            let optionExists = false;
            for (let i = 0; i < modelSelect.options.length; i++) {
              if (modelSelect.options[i].value === model) {
                optionExists = true;
                break;
              }
            }
            
            if (optionExists) {
              modelSelect.value = model;
              if (modelCustomGroup) modelCustomGroup.style.display = "none";
            } else {
              modelSelect.value = "custom";
              if (modelCustomGroup) modelCustomGroup.style.display = "flex";
              if (modelCustomInput) modelCustomInput.value = model;
            }
          }
        }
        
        // Fetch and update AI API key configuration status
        updateAIStatusUI();

        // Show clarifications banner if pending
        renderClarificationBanner();

        // Populate dynamic inputs in collaborator and incidences forms
        generateDynamicInputs();

        return loadCompanies().then(() => {
          // Now load employees
          return fetch("/api/employees?_t=" + Date.now());
        });
      })
      .then(res => {
        if (!res.ok) {
          return res.json().then(errData => {
            console.error("Detalles del error del servidor:", errData);
            throw new Error(errData.error || "Error de respuesta del servidor");
          }).catch(e => {
            throw new Error("Error de respuesta del servidor");
          });
        }
        return res.json();
      })
      .then(data => {
        state.employees = data.employees;
        if (data.config) {
          state.config = { ...state.config, ...data.config };
        } else if (data.uma) {
          state.config.uma = data.uma;
        }
        state.db_path = data.db_path || "Nomina ciega.xlsx";
        state.period = data.period;
        state.config_status = data.config_status || { missing_lft_params: [], missing_companies_config: [] };

        if (dbIndicator) {
          dbIndicator.className = "badge success";
          dbIndicator.innerHTML = '<i data-lucide="database" style="width: 16px; height: 16px;"></i>';
          dbIndicator.title = "Base de datos Excel conectada";
        }
        
        const periodSelect = document.getElementById("period-select");
        if (periodSelect) {
          const isMonthly = isPeriodStrMonthly(state.period);
          const btnQuincenal = document.getElementById("btn-period-quincenal");
          const btnMensual = document.getElementById("btn-period-mensual");
          if (btnQuincenal && btnMensual) {
            if (isMonthly) {
              btnQuincenal.classList.remove("active");
              btnMensual.classList.add("active");
            } else {
              btnQuincenal.classList.add("active");
              btnMensual.classList.remove("active");
            }
          }
          initPeriodControls();
          populatePeriodDropdown(isMonthly ? "mensual" : "quincenal", state.period);
        }

        checkAndRenderConfigAlerts();
        renderActiveView();
        if (window.lucide) lucide.createIcons();
      })
      .catch(err => {
        console.error("Error cargando base de datos Excel:", err);
        if (dbIndicator) {
          dbIndicator.className = "badge danger";
          dbIndicator.innerHTML = '<i data-lucide="database" style="width: 16px; height: 16px;"></i>';
          dbIndicator.title = "Base de datos Excel desconectada / bloqueada";
        }
        showToast("Error al conectar con la base de datos Excel. Asegúrate de cerrar el archivo Excel si lo tienes abierto.", "error");
        if (window.lucide) lucide.createIcons();
      });
  }

  function checkAndRenderConfigAlerts() {
    const banner = document.getElementById("config-warning-banner");
    const warningText = document.getElementById("config-warning-text");
    const fixBtn = document.getElementById("btn-fix-config");
    
    if (!banner) return;
    
    const missingLft = state.config_status?.missing_lft_params || [];
    const missingCos = state.config_status?.missing_companies_config || [];
    
    if (missingLft.length === 0 && missingCos.length === 0) {
      banner.style.display = "none";
      return;
    }
    
    let messages = [];
    if (missingLft.length > 0) {
      messages.push(`Falta configurar los siguientes parámetros de Ley (LFT) en el archivo Excel: <strong>${missingLft.join(", ")}</strong>.`);
    }
    if (missingCos.length > 0) {
      messages.push(`Falta definir la Prima de Riesgo para las siguientes empresas registradas: <strong>${missingCos.join(", ")}</strong>.`);
    }
    
    warningText.innerHTML = messages.join("<br>");
    banner.style.display = "block";
    if (window.lucide) lucide.createIcons();
    
    if (fixBtn) {
      const newFixBtn = fixBtn.cloneNode(true);
      fixBtn.parentNode.replaceChild(newFixBtn, fixBtn);
      newFixBtn.addEventListener("click", () => {
        switchTab("config");
      });
    }
  }

  // 3. Dynamic input field generation
  function generateDynamicInputs() {
    // 1. Collaborator form dynamic payments
    const container = document.getElementById("collaborator-dynamic-fields");
    if (container && state.schema && state.schema.columns) {
      container.innerHTML = "";
      const otherCols = state.schema.columns.filter(col => col.category === "others" && col.editable);
      otherCols.forEach(col => {
        container.innerHTML += `
          <div class="form-group">
            <label for="col-${col.field}">${col.label || col.header}</label>
            <input type="number" id="col-${col.field}" min="0" step="0.01" value="0.0">
          </div>
        `;
      });
    }

    // 2. Dynamic incidences deductions
    const incContainer = document.getElementById("incidences-dynamic-fields");
    if (incContainer && state.schema && state.schema.columns) {
      incContainer.innerHTML = "";
      const deductions = state.schema.columns.filter(col => col.category === "deduction" && col.incidence_editable);
      deductions.forEach(col => {
        incContainer.innerHTML += `
          <div class="form-group">
            <label for="inc-${col.field}">${col.label || col.header}</label>
            <input type="number" id="inc-${col.field}" min="0" value="0" step="0.01" placeholder="Ej. ${col.label || col.header}">
          </div>
        `;
      });
    }
  }

  // 4. Render Agent Clarifications Banner
  function renderClarificationBanner() {
    const banner = document.getElementById("schema-clarification-banner");
    const list = document.getElementById("clarification-questions-list");
    if (!banner || !list) return;

    const questions = state.schema.pending_clarifications || [];
    if (questions.length === 0) {
      banner.style.display = "none";
      return;
    }

    banner.style.display = "block";
    list.innerHTML = "";

    questions.forEach(q => {
      list.innerHTML += `
        <div class="clarify-card" style="background: rgba(0,0,0,0.15); padding: 1rem; border-radius: 8px; border: 1px solid rgba(255,255,255,0.05); margin-top: 0.5rem;">
          <h4 style="font-size: 0.9rem; font-weight: 600; margin-bottom: 0.5rem; color: #fff;">${q.question}</h4>
          <div style="display: flex; gap: 0.75rem; flex-wrap: wrap;">
            ${q.options.map(opt => `
              <button type="button" class="btn btn-secondary btn-sm clarify-opt-btn" data-field="${q.field}" data-answer="${opt}">${opt}</button>
            `).join("")}
          </div>
        </div>
      `;
    });

    // Attach click events
    document.querySelectorAll(".clarify-opt-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const field = btn.getAttribute("data-field");
        const answer = btn.getAttribute("data-answer");
        submitClarification(field, answer);
      });
    });
  }

  function submitClarification(field, answer) {
    fetch("/api/schema/clarify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ field, answer })
    })
      .then(res => res.json())
      .then(resData => {
        if (resData.error) {
          showToast(resData.error, "error");
          return;
        }
        showToast("Aclaración guardada con éxito. Reconfigurando esquema.");
        loadState();
      })
      .catch(err => {
        console.error("Error submitting clarification:", err);
        showToast("Error al guardar respuesta en el Agente.", "error");
      });
  }

  // 5. Payroll Math Calculations (Front-end Preview Engine)
  function getPeriodEndDate() {
    if (!window.state || !window.state.period) return new Date();
    const match = window.state.period.match(/\d+\s+al\s+(\d+)\s+([a-zA-Z]+)\s+(\d{4})/i);
    if (match) {
        const day = parseInt(match[1]);
        const monthStr = match[2].toLowerCase().substring(0, 3);
        const year = parseInt(match[3]);
        const months = { "ene": 0, "feb": 1, "mar": 2, "abr": 3, "may": 4, "jun": 5, "jul": 6, "ago": 7, "sep": 8, "oct": 9, "nov": 10, "dic": 11 };
        const month = months[monthStr] !== undefined ? months[monthStr] : 3;
        return new Date(year, month, day);
    }
    return new Date();
  }

  function isEmployeeBaja(emp, periodStr) {
    if (!emp || !emp.baja) return false;
    const periodEnd = getPeriodEndDate();
    const bajaParts = emp.baja.split("-");
    if (bajaParts.length !== 3) return true;
    const bYear = parseInt(bajaParts[0], 10);
    const bMonth = parseInt(bajaParts[1], 10) - 1;
    const bDay = parseInt(bajaParts[2], 10);
    const bajaDate = new Date(bYear, bMonth, bDay, 12, 0, 0);
    const periodEndDateNoon = new Date(periodEnd.getFullYear(), periodEnd.getMonth(), periodEnd.getDate(), 12, 0, 0);
    return bajaDate <= periodEndDateNoon;
  }

  function getVacationDays(years) {
    if (years < 1) return 0;
    if (years === 1) return 12;
    if (years === 2) return 14;
    if (years === 3) return 16;
    if (years === 4) return 18;
    if (years === 5) return 20;
    if (years <= 10) return 22;
    if (years <= 15) return 24;
    if (years <= 20) return 26;
    if (years <= 25) return 28;
    if (years <= 30) return 30;
    return 20 + 2 * Math.floor((years - 1) / 5);
  }

  function getFactorIntegracion(years, cfg) {
    const vac = getVacationDays(years);
    const ag = cfg.aguinaldo;
    const pr = cfg.prima / 100;
    return 1 + (ag / 365) + ((vac * pr) / 365);
  }

  function calculateEmployeePayroll(emp, cfg) {
    const activeDate = getPeriodEndDate();
    const ingresoDate = new Date(emp.ingreso);
    let yearsCompleted = 0;
    if (!isNaN(ingresoDate.getTime())) {
      const diffTime = Math.max(0, activeDate - ingresoDate);
      yearsCompleted = Math.floor(diffTime / (1000 * 60 * 60 * 24 * 365.25));
    }
    
    const isBaja = isEmployeeBaja(emp, state.period);
    
    // Factor de Integración
    const fi = isBaja ? 0 : getFactorIntegracion(yearsCompleted, cfg);
    const sdi = (emp.salario_diario && !isBaja) ? (emp.salario_diario * fi) : 0;
    
    // Nominal Perceptions
    const sueldoNominal = (emp.salario_diario && !isBaja) ? (emp.salario_diario * cfg.diasMes) : 0;
    
    // Calculate puntualidad
    let puntualidad = 0;
    if (emp.salario_diario && !isBaja) {
      const losesPuntualidad = (emp.retardos >= 3) && (emp.forzar_puntualidad !== "SI");
      if (!losesPuntualidad && sdi > 0) {
        puntualidad = sdi * 0.10 * cfg.diasMes;
      }
    }
    
    // Calculate asistencia
    let asistencia = 0;
    if (emp.salario_diario && !isBaja) {
      const losesAsistencia = (emp.faltas > 0) && (emp.forzar_asistencia !== "SI");
      if (!losesAsistencia && sdi > 0) {
        asistencia = sdi * 0.10 * cfg.diasMes;
      }
    }
    
    // Calculate vales de despensa
    let valesDespensa = 0;
    const isMonthly = isPeriodStrMonthly(state.period);
    const diasPeriodo = getPeriodDaysCount(state.period);
    
    if (emp.salario_diario && !isBaja) {
      if (emp.ajuste_vales !== undefined && emp.ajuste_vales !== null && emp.ajuste_vales !== "") {
        valesDespensa = parseFloat(emp.ajuste_vales) || 0.0;
      } else {
        const baseVales = cfg.uma * (cfg.valesPct / 100) * cfg.diasMes;
        const effectiveFaltas = emp.forzar_vales === "SI" ? 0 : (emp.faltas || 0);
        if (effectiveFaltas > 0) {
          const divisorVales = isMonthly ? diasPeriodo : 15;
          valesDespensa = (baseVales / divisorVales) * (divisorVales - effectiveFaltas);
        } else {
          valesDespensa = baseVales;
        }
      }
    }
    
    // Calculate fondo de ahorro
    let fondoAhorro = 0;
    if (emp.salario_diario && emp.fondo_ahorro_activo && !isBaja) {
      if (emp.ajuste_fondo_ahorro !== undefined && emp.ajuste_fondo_ahorro !== null && emp.ajuste_fondo_ahorro !== "") {
        fondoAhorro = parseFloat(emp.ajuste_fondo_ahorro) || 0.0;
      } else {
        const baseFA = sueldoNominal * (cfg.faPct / 100);
        const capFA = 1.3 * cfg.uma * cfg.diasMes;
        fondoAhorro = Math.min(baseFA, capFA);
      }
    }
    
    const percepcionSueldos = sueldoNominal + puntualidad + asistencia + valesDespensa + fondoAhorro;
    
    // Dynamic Other payment components sum
    let totalOtros = 0;
    if (state.schema && state.schema.columns) {
      const otherCols = state.schema.columns.filter(c => c.category === "others");
      otherCols.forEach(col => {
        const val = !isBaja ? (emp[col.field] || 0.0) : 0.0;
        totalOtros += val;
      });
    }
    
    const sueldoBrutoMensual = percepcionSueldos + totalOtros;
    const sueldoBrutoQuincenalNormal = isMonthly ? sueldoBrutoMensual : (sueldoBrutoMensual / 2);
    
    // Absences deduction impact
    const faltas = emp.faltas || 0;
    const divisorFaltas = isMonthly ? diasPeriodo : 15;
    const descuentoFaltas = (sueldoBrutoQuincenalNormal / divisorFaltas) * faltas;
    
    // Dynamic Additional Deductions sum
    let descuentoAdicional = 0;
    if (state.schema && state.schema.columns) {
      const deductionCols = state.schema.columns.filter(c => c.category === "deduction");
      deductionCols.forEach(col => {
        const val = !isBaja ? (emp[col.field] || 0.0) : 0.0;
        descuentoAdicional += val;
      });
    }
    
    // Final Net Period matches Excel formula
    const sueldoNetoQuincenal = isMonthly 
      ? Math.max(0, (sueldoBrutoMensual - descuentoAdicional) / diasPeriodo * (diasPeriodo - faltas))
      : Math.max(0, (sueldoBrutoMensual - descuentoAdicional) / 2 / 15 * (15 - faltas));
    
    return {
      antiguedad: yearsCompleted,
      factorIntegracion: fi,
      factor_integracion: fi,
      sdi,
      sueldoNominal,
      sueldo_nominal: sueldoNominal,
      puntualidad,
      asistencia,
      valesDespensa,
      vales_despensa: valesDespensa,
      fondoAhorro,
      fondo_ahorro: fondoAhorro,
      percepcionSueldos,
      percepcion_sueldos: percepcionSueldos,
      totalOtros,
      sueldoBrutoMensual,
      bruto_mensual: sueldoBrutoMensual,
      sueldoBrutoQuincenalNormal,
      bruto_quincenal: sueldoBrutoQuincenalNormal,
      descuentoFaltas,
      descuento_incidencia: descuentoFaltas,
      descuentoAdicional,
      descuento_adicional: descuentoAdicional,
      sueldoNetoQuincenal,
      neto_quincenal: sueldoNetoQuincenal,
      isBaja
    };
  }

  // 6. Tab Navigation
  const navItems = document.querySelectorAll(".nav-item");
  const viewSections = document.querySelectorAll(".view-section");

  navItems.forEach(item => {
    item.addEventListener("click", () => {
      navItems.forEach(nav => nav.classList.remove("active"));
      viewSections.forEach(sec => sec.classList.remove("active"));
      
      item.classList.add("active");
      const target = item.getAttribute("data-target");
      document.getElementById(target).classList.add("active");
      state.activeTab = target;
      
      renderActiveView();
    });
  });

  function renderActiveView() {
    switch (state.activeTab) {
      case "dashboard":
        renderDashboard();
        break;
      case "collaborators":
        renderCollaborators();
        break;
      case "incidences":
        renderIncidences();
        break;
      case "prenomina":
        renderPrenomina();
        break;
      case "config":
        renderConfig();
        break;
    }
  }

  // 7. Toast Notifications
  function showToast(message, type = "success") {
    const toast = document.getElementById("toast-notify");
    const toastMessage = document.getElementById("toast-message");
    const iconSuccess = document.getElementById("toast-icon-success");
    const iconWarning = document.getElementById("toast-icon-warning");
    const iconError = document.getElementById("toast-icon-error");
    
    toast.className = `toast-notification toast-${type} active`;
    toastMessage.textContent = message;
    
    iconSuccess.style.display = type === "success" ? "block" : "none";
    iconWarning.style.display = type === "warning" ? "block" : "none";
    iconError.style.display = type === "error" ? "block" : "none";
    
    setTimeout(() => {
      toast.classList.remove("active");
    }, 3500);
  }

  // 8. View Rendering - DASHBOARD
  function renderDashboard() {
    let activeCount = 0;
    let totalPayroll = 0;
    let totalDiscountedDays = 0;
    let totalFA = 0;
    
    const schemeCounts = {
      nominal: 0,
      asimilados: 0,
      gasolina: 0,
      socio: 0,
      efectivo: 0,
      facturado: 0
    };
    
    const schemeTotals = {
      nominal: 0,
      asimilados: 0,
      gasolina: 0,
      socio: 0,
      efectivo: 0,
      facturado: 0
    };

    state.employees.forEach(emp => {
      const calc = calculateEmployeePayroll(emp, state.config);
      if (!calc.isBaja) {
        activeCount++;
        totalPayroll += calc.sueldoNetoQuincenal;
        totalDiscountedDays += emp.faltas || 0;
        totalFA += calc.fondoAhorro;
        
        if (emp.salario_diario > 0) {
          schemeCounts.nominal++;
          schemeTotals.nominal += calc.sueldoNominal;
        }
        
        // Add dynamic payments count
        if (emp.asimilados > 0) { schemeCounts.asimilados++; schemeTotals.asimilados += emp.asimilados; }
        if (emp.gasolina > 0) { schemeCounts.gasolina++; schemeTotals.gasolina += emp.gasolina; }
        if (emp.socio > 0) { schemeCounts.socio++; schemeTotals.socio += emp.socio; }
        if (emp.efectivo > 0) { schemeCounts.efectivo++; schemeTotals.efectivo += emp.efectivo; }
        if (emp.facturado > 0) { schemeCounts.facturado++; schemeTotals.facturado += emp.facturado; }
      }
    });

    document.getElementById("stat-active-count").textContent = activeCount;
    document.getElementById("stat-payroll-cost").textContent = formatCurrency(totalPayroll);
    document.getElementById("stat-discounted-days").textContent = `${totalDiscountedDays} día${totalDiscountedDays !== 1 ? 's' : ''}`;
    document.getElementById("stat-savings-fund").textContent = formatCurrency(totalFA);

    const distBody = document.getElementById("distribution-table-body");
    distBody.innerHTML = "";
    
    const totalSchemesSum = Object.values(schemeTotals).reduce((a, b) => a + b, 0);
    const components = [
      { name: "Sueldos Nominales (IMSS)", count: schemeCounts.nominal, total: schemeTotals.nominal },
      { name: "Honorarios Asimilados", count: schemeCounts.asimilados, total: schemeTotals.asimilados },
      { name: "Combustible (Gasolina)", count: schemeCounts.gasolina, total: schemeTotals.gasolina },
      { name: "Socios", count: schemeCounts.socio, total: schemeTotals.socio },
      { name: "Efectivo", count: schemeCounts.efectivo, total: schemeTotals.efectivo },
      { name: "Facturado (Comisiones)", count: schemeCounts.facturado, total: schemeTotals.facturado }
    ];

    components.forEach(comp => {
      const pct = totalSchemesSum > 0 ? ((comp.total / totalSchemesSum) * 100).toFixed(1) : 0;
      distBody.innerHTML += `
        <tr>
          <td style="font-weight: 500;">${comp.name}</td>
          <td><span class="badge info">${comp.count} colaborador${comp.count !== 1 ? 'es' : ''}</span></td>
          <td style="font-weight: 600;">${formatCurrency(comp.total)}</td>
          <td>
            <div style="display:flex; align-items:center; gap:0.5rem;">
              <div style="background: rgba(255,255,255,0.05); width:80px; height:6px; border-radius:3px; overflow:hidden;">
                <div style="background: var(--primary); width: ${pct}%; height: 100%;"></div>
              </div>
              <span>${pct}%</span>
            </div>
          </td>
        </tr>
      `;
    });

    const incidencesList = document.getElementById("recent-incidences-list");
    incidencesList.innerHTML = "";
    
    const employeesWithIncidences = state.employees.filter(emp => emp.faltas > 0 || emp.vacaciones > 0 || emp.retardos > 0 || emp.descuento_adicional > 0);
    
    if (employeesWithIncidences.length === 0) {
      incidencesList.innerHTML = `
        <div style="text-align:center; padding: 2rem; color: var(--text-dark);">
          <i data-lucide="check-circle" style="font-size: 2rem; margin-bottom: 0.5rem; color: var(--success);"></i>
          <p>Sin incidencias registradas en este periodo.</p>
        </div>
      `;
    } else {
      employeesWithIncidences.forEach(emp => {
        let items = [];
        if (emp.faltas > 0) items.push(`${emp.faltas} falta${emp.faltas > 1 ? 's' : ''}`);
        if (emp.retardos > 0) items.push(`${emp.retardos} retardo${emp.retardos > 1 ? 's' : ''}`);
        if (emp.vacaciones > 0) items.push(`${emp.vacaciones} día${emp.vacaciones > 1 ? 's' : ''} de vacaciones`);
        if (emp.descuento_adicional > 0) items.push(`descuento de ${formatCurrency(emp.descuento_adicional)}`);

        incidencesList.innerHTML += `
          <div style="background: rgba(0,0,0,0.15); padding: 0.75rem 1rem; border-radius: 8px; border-left: 3px solid var(--danger); display:flex; justify-content:space-between; align-items:center;">
            <div>
              <h4 style="font-size: 0.92rem; font-weight:600;"></h4>
              <p style="font-size: 0.8rem; color: var(--text-muted);">${items.join(", ")}</p>
            </div>
            <span class="badge danger">${emp.observaciones || 'Incidencia'}</span>
          </div>
        `;
      });
    }
    
    if (window.lucide) lucide.createIcons();
  }

  // 9. View Rendering - COLLABORATORS (CRM)
  const collSearch = document.getElementById("coll-search");
  const filterEmpresa = document.getElementById("filter-empresa");
  const filterArea = document.getElementById("filter-area");
  const filterStatus = document.getElementById("filter-status");

  [collSearch, filterEmpresa, filterArea, filterStatus].forEach(el => {
    if (el) el.addEventListener("input", renderCollaborators);
  });

  function renderCollaborators() {
    const tbody = document.getElementById("collaborators-table-body");
    if (!tbody) return;
    tbody.innerHTML = "";
    
    const query = collSearch.value.toLowerCase().trim();
    const empresa = filterEmpresa.value;
    const area = filterArea.value;
    const status = filterStatus.value;

    const filtered = state.employees.filter(emp => {
      const name = (emp.nombre || "").toString().toLowerCase();
      const code = (emp.id || "").toString().toLowerCase();
      const puesto = (emp.puesto || "").toString().toLowerCase();
      const matchSearch = name.includes(query) || 
                          code.includes(query) || 
                          puesto.includes(query);
      
      const matchEmpresa = !empresa || emp.empresa === empresa;
      const matchArea = !area || emp.area === area;
      
      const isBaja = isEmployeeBaja(emp, state.period);
      const matchStatus = status === "todos" || 
                          (status === "alta" && !isBaja) || 
                          (status === "baja" && isBaja);
                          
      return matchSearch && matchEmpresa && matchArea && matchStatus;
    });

    if (filtered.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="10" style="text-align: center; padding: 2rem; color: var(--text-muted);">
            No se encontraron colaboradores con los filtros seleccionados.
          </td>
        </tr>
      `;
      return;
    }

    filtered.forEach(emp => {
      const activeDate = getPeriodEndDate();
      let diffTime = 0;
      let years = 0;
      const ingresoDate = new Date(emp.ingreso);
      if (!isNaN(ingresoDate.getTime())) {
        diffTime = Math.max(0, activeDate - ingresoDate);
        years = diffTime / (1000 * 60 * 60 * 24 * 365.25);
      }
      const isBaja = isEmployeeBaja(emp, state.period);
      
      let schemes = [];
      if (emp.salario_diario > 0) schemes.push("Nominal IMSS");
      
      // Dynamic payment display list
      if (state.schema && state.schema.columns) {
        state.schema.columns.forEach(col => {
          if (col.category === "others" && emp[col.field] > 0) {
            schemes.push(col.label.split("(")[0].trim());
          }
        });
      }
      
      const initials = (emp.nombre || "")
        .split(" ")
        .filter(w => w.length > 0)
        .map(w => w[0])
        .join("")
        .substring(0, 2)
        .toUpperCase() || "??";

      tbody.innerHTML += `
        <tr class="${isBaja ? 'baja-row' : ''}">
          <td><span style="font-family: monospace; font-weight:600;">${emp.id}</span></td>
          <td>
            <div class="coll-row-flex">
              <div class="collaborator-avatar">${initials}</div>
              <div>
                <div style="font-weight: 600;">${emp.nombre || '-'}</div>
                <div style="font-size:0.75rem; color:var(--text-muted);">No. ${emp.no}</div>
              </div>
            </div>
          </td>
          <td>${emp.empresa || '-'}</td>
          <td>
            <div>${emp.area || '-'}</div>
            <div style="font-size:0.78rem; color:var(--text-dark);">${emp.depto || '-'}</div>
          </td>
          <td>${emp.puesto || '-'}</td>
          <td>${emp.ingreso || '-'}</td>
          <td>${years.toFixed(1)} años</td>
          <td>
            <div style="display:flex; flex-wrap:wrap; gap:0.25rem; max-width: 200px;">
              ${schemes.map(s => `<span class="badge info" style="font-size:0.65rem; padding: 0.1rem 0.35rem;">${s}</span>`).join("")}
            </div>
          </td>
          <td>
            <span class="badge ${isBaja ? 'danger' : 'success'}">${isBaja ? 'Baja' : 'Alta'}</span>
          </td>
          <td>
            <div class="action-buttons">
              <button class="btn btn-secondary btn-sm edit-coll-btn" data-id="${emp.id}" title="Editar Esquema">
                <i data-lucide="edit-3"></i>
              </button>
              <button class="btn ${isBaja ? 'btn-secondary' : 'btn-danger'} btn-sm toggle-status-btn" data-id="${emp.id}" title="${isBaja ? 'Reingreso' : 'Dar de Baja'}">
                <i data-lucide="${isBaja ? 'user-check' : 'user-x'}"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    });

    document.querySelectorAll(".edit-coll-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        openCollaboratorModal(btn.getAttribute("data-id"));
      });
    });

    document.querySelectorAll(".toggle-status-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        toggleCollaboratorStatus(btn.getAttribute("data-id"));
      });
    });

    if (window.lucide) lucide.createIcons();
  }

  // 10. View Rendering - INCIDENCES
  const incSearchColl = document.getElementById("inc-search-coll");
  if (incSearchColl) {
    incSearchColl.addEventListener("input", renderIncidencesCollList);
  }

  function renderPeriodIncidences() {
    const tbody = document.getElementById("period-incidences-table-body");
    if (!tbody) return;

    fetch("/api/incidences?_t=" + Date.now(), {
      headers: {
        "Authorization": "Bearer " + (localStorage.getItem("rhm_session_token") || "")
      }
    })
      .then(res => {
        if (!res.ok) throw new Error("Error fetching period incidences");
        return res.json();
      })
      .then(data => {
        tbody.innerHTML = "";
        if (!data || data.length === 0) {
          tbody.innerHTML = `
            <tr>
              <td colspan="7" style="text-align: center; padding: 2rem; color: var(--text-muted);">
                No hay eventos de incidencias registrados en este período.
              </td>
            </tr>
          `;
          return;
        }

        data.forEach(item => {
          let details = [];
          if (item.faltas > 0) details.push(`<span class="badge danger" style="font-size:0.7rem; padding:0.15rem 0.35rem;">Faltas: ${item.faltas}</span>`);
          if (item.retardos > 0) details.push(`<span class="badge warning" style="font-size:0.7rem; padding:0.15rem 0.35rem; color:#fff;">Retardos: ${item.retardos}</span>`);
          if (item.vacaciones > 0) details.push(`<span class="badge success" style="font-size:0.7rem; padding:0.15rem 0.35rem;">Vacaciones: ${item.vacaciones}</span>`);
          if (item.descuento_adicional > 0) details.push(`<span class="badge info" style="font-size:0.7rem; padding:0.15rem 0.35rem;">Descuento: $${item.descuento_adicional}</span>`);
          
          // Dynamic deductions from schema
          if (state.schema && state.schema.columns) {
            state.schema.columns.forEach(col => {
              if (col.category === "deduction" && col.incidence_editable && col.field !== "descuento_adicional") {
                const val = item[col.field] || 0;
                if (val > 0) {
                  details.push(`<span class="badge info" style="font-size:0.7rem; padding:0.15rem 0.35rem;">${col.header || col.label}: $${val}</span>`);
                }
              }
            });
          }

          const obsUpper = (item.observaciones || "").trim().toUpperCase();
          const isStatusEvent = obsUpper === "ALTA" || obsUpper === "BAJA" || obsUpper === "REINGRESO" ||
                                obsUpper.startsWith("ALTA:") || obsUpper.startsWith("BAJA:") || obsUpper.startsWith("REINGRESO:");

          if (isStatusEvent) {
            let badgeClass = "info";
            if (obsUpper.includes("BAJA")) badgeClass = "danger";
            else if (obsUpper.includes("ALTA") || obsUpper.includes("REINGRESO")) badgeClass = "success";
            details.push(`<span class="badge ${badgeClass}" style="font-size:0.7rem; padding:0.15rem 0.35rem; font-weight:bold;">${item.observaciones}</span>`);
          }

          let overrides = [];
          if (item.forzar_asistencia === "SI") overrides.push(`<span class="badge info" style="font-size: 0.65rem; padding: 0.1rem 0.3rem;">Forzar Asistencia</span>`);
          if (item.forzar_puntualidad === "SI") overrides.push(`<span class="badge info" style="font-size: 0.65rem; padding: 0.1rem 0.3rem;">Forzar Puntualidad</span>`);
          if (item.forzar_vales === "SI") overrides.push(`<span class="badge info" style="font-size: 0.65rem; padding: 0.1rem 0.3rem;">Forzar Vales</span>`);
          if (item.ajuste_vales !== null && item.ajuste_vales !== undefined && item.ajuste_vales !== "") {
            overrides.push(`<span class="badge warning" style="font-size: 0.65rem; padding: 0.1rem 0.3rem;">Aj. Vales: $${item.ajuste_vales}</span>`);
          }
          if (item.ajuste_fondo_ahorro !== null && item.ajuste_fondo_ahorro !== undefined && item.ajuste_fondo_ahorro !== "") {
            overrides.push(`<span class="badge warning" style="font-size: 0.65rem; padding: 0.1rem 0.3rem;">Aj. FA: $${item.ajuste_fondo_ahorro}</span>`);
          }

          const detailHtml = details.length > 0 ? details.join(" ") : "-";
          const overridesHtml = overrides.length > 0 ? `<div style="display:flex; flex-wrap:wrap; gap:0.25rem;">${overrides.join("")}</div>` : "-";
          const displayObs = isStatusEvent ? "Evento de Cambio de Estado / Registro de Colaborador" : (item.observaciones || "-");

          tbody.innerHTML += `
            <tr>
              <td class="align-center">${item.date}</td>
              <td class="align-center" style="font-family:monospace; font-weight:600;">${item.id}</td>
              <td>${item.nombre}</td>
              <td>${detailHtml}</td>
              <td>${overridesHtml}</td>
              <td class="align-left" title="${item.observaciones || ''}">${displayObs}</td>
              <td class="align-center">
                <button class="btn btn-danger btn-sm delete-period-inc-btn" data-id="${item.id}" data-date="${item.date}" title="Eliminar Evento">
                  <i data-lucide="trash-2"></i>
                </button>
              </td>
            </tr>
          `;
        });

        document.querySelectorAll(".delete-period-inc-btn").forEach(btn => {
          btn.addEventListener("click", () => {
            const empId = btn.getAttribute("data-id");
            const incDate = btn.getAttribute("data-date");
            if (confirm(`¿Estás seguro de que deseas eliminar el evento de incidencia registrado para el colaborador ${empId} en la fecha ${incDate}?`)) {
              deletePeriodIncidence(empId, incDate);
            }
          });
        });

        if (window.lucide) lucide.createIcons();
      })
      .catch(err => {
        console.error("Error rendering period incidences:", err);
        tbody.innerHTML = `
          <tr>
            <td colspan="7" style="text-align: center; padding: 2rem; color: var(--danger);">
              Error al cargar el historial de incidencias del servidor.
            </td>
          </tr>
        `;
      });
  }

  function deletePeriodIncidence(employeeId, date) {
    fetch(`/api/incidences?employee_id=${encodeURIComponent(employeeId)}&date=${encodeURIComponent(date)}`, {
      method: "DELETE",
      headers: {
        "Authorization": "Bearer " + (localStorage.getItem("rhm_session_token") || "")
      }
    })
      .then(res => res.json())
      .then(resData => {
        if (resData.error) {
          showToast(resData.error, "error");
          return;
        }
        showToast("Incidencia eliminada con éxito.");
        loadState().then(() => {
          if (state.selectedIncidenceEmployeeId) {
            loadIncidencesForSelectedEmployee(state.selectedIncidenceEmployeeId);
          }
        });
      })
      .catch(err => {
        console.error("Error al eliminar incidencia:", err);
        showToast("Error al conectar con el servidor para eliminar la incidencia.", "error");
      });
  }

  function renderIncidences() {
    renderIncidencesCollList();
    renderPeriodIncidences();
    const activeEmployees = state.employees.filter(e => !(e.baja));
    if (activeEmployees.length > 0 && !state.selectedIncidenceEmployeeId) {
      selectIncidenceEmployee(activeEmployees[0].id);
    } else if (state.selectedIncidenceEmployeeId) {
      selectIncidenceEmployee(state.selectedIncidenceEmployeeId);
    }
  }

  function renderIncidencesCollList() {
    const listDiv = document.getElementById("incidences-coll-list");
    if (!listDiv) return;
    listDiv.innerHTML = "";
    
    const query = incSearchColl.value.toLowerCase().trim();
    const filtered = state.employees.filter(emp => {
      const isBaja = isEmployeeBaja(emp, state.period);
      const name = (emp.nombre || "").toString().toLowerCase();
      const code = (emp.id || "").toString().toLowerCase();
      return !isBaja && (name.includes(query) || code.includes(query));
    });

    filtered.forEach(emp => {
      const activeClass = state.selectedIncidenceEmployeeId === emp.id ? "active" : "";
      
      // Calculate dynamic deductions flag
      let hasIncidences = emp.faltas > 0;
      if (state.schema && state.schema.columns) {
        state.schema.columns.filter(c => c.category === "deduction").forEach(c => {
          if (emp[c.field] > 0) hasIncidences = true;
        });
      }
      
      const statusDot = hasIncidences ? `<span class="badge warning" style="float:right; font-size:0.6rem; padding:0.15rem 0.35rem;">Incidencias</span>` : "";
      
      listDiv.innerHTML += `
        <div class="list-item-coll ${activeClass}" data-id="${emp.id}">
          ${statusDot}
          <h4></h4>
          <p> | Cód. ${emp.id}</p>
        </div>
      `;
    });

    document.querySelectorAll(".list-item-coll").forEach(item => {
      item.addEventListener("click", () => {
        selectIncidenceEmployee(item.getAttribute("data-id"));
      });
    });
  }

  function selectIncidenceEmployee(id) {
    state.selectedIncidenceEmployeeId = id;
    
    document.querySelectorAll(".list-item-coll").forEach(item => {
      if (item.getAttribute("data-id") === id) {
        item.classList.add("active");
      } else {
        item.classList.remove("active");
      }
    });

    const emp = state.employees.find(e => e.id === id);
    if (!emp) return;

    document.getElementById("inc-form-container").style.display = "block";
    document.getElementById("inc-coll-name").textContent = `Incidencias: ${emp.nombre} (${emp.id})`;
    
    const dateInput = document.getElementById("inc-fecha");
    if (dateInput) {
      dateInput.value = getPeriodDefaultDate(state.period);
    }
    
    loadIncidencesForSelectedEmployee(id);
  }

  function loadIncidencesForSelectedEmployee(id) {
    const historyContainer = document.getElementById("incidence-history-container");
    if (!historyContainer) return Promise.resolve();

    historyContainer.innerHTML = '<div style="text-align:center; padding: 1rem;"><i data-lucide="refresh-cw" class="spin" style="width: 18px; height: 18px;"></i> Cargando historial...</div>';
    if (window.lucide) lucide.createIcons();

    return fetch(`/api/incidences?id=${encodeURIComponent(id)}`, {
      headers: {
        "Authorization": "Bearer " + (localStorage.getItem("rhm_session_token") || "")
      }
    })
      .then(res => {
        if (!res.ok) throw new Error("Error cargando historial de incidencias");
        return res.json();
      })
      .then(incidences => {
        state.currentEmployeeIncidences = incidences;
        renderIncidenceHistory(incidences);
        applyIncidenceValuesForSelectedDate();
      })
      .catch(err => {
        console.error("Error loading incidences history:", err);
        historyContainer.innerHTML = '<div style="color: var(--danger); text-align:center; padding: 1rem;">Error al cargar historial</div>';
      });
  }

  function renderIncidenceHistory(incidences) {
    const historyContainer = document.getElementById("incidence-history-container");
    if (!historyContainer) return;

    if (incidences.length === 0) {
      historyContainer.innerHTML = `
        <h4 style="font-size: 0.9rem; font-weight: 600; margin-bottom: 0.5rem; color: var(--text-muted);">Incidencias Registradas en la Quincena</h4>
        <div style="font-size: 0.8rem; color: var(--text-muted); padding: 0.5rem; background: rgba(255,255,255,0.02); border-radius: 6px; border: 1px dashed var(--panel-border); text-align: center;">
          No hay incidencias registradas para este colaborador en esta quincena.
        </div>
      `;
      return;
    }

    let rowsHtml = "";
    incidences.forEach(inc => {
      let details = [];
      if (inc.faltas > 0) details.push(`${inc.faltas} falta${inc.faltas > 1 ? 's' : ''}`);
      if (inc.vacaciones > 0) details.push(`${inc.vacaciones} vacación${inc.vacaciones > 1 ? 'es' : ''}`);
      if (inc.retardos > 0) details.push(`${inc.retardos} retardo${inc.retardos > 1 ? 's' : ''}`);
      
      const descVal = parseFloat(inc.descuento_adicional) || 0.0;
      if (descVal > 0) details.push(`Desc. adicional: ${formatCurrency(descVal)}`);
      
      // Dynamic deductions
      if (state.schema && state.schema.columns) {
        state.schema.columns.forEach(col => {
          if (col.category === "deduction" && col.incidence_editable && col.field !== "descuento_adicional") {
            const val = parseFloat(inc[col.field]) || 0.0;
            if (val > 0) {
              details.push(`${col.label || col.header}: ${formatCurrency(val)}`);
            }
          }
        });
      }

      const descText = details.join(", ") || "Observación / Justificación";
      const obs = inc.observaciones ? ` <span style="display:block; font-size:0.75rem; color:var(--text-muted); margin-top: 2px;">Obs: ${escapeHtml(inc.observaciones)}</span>` : "";

      rowsHtml += `
        <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
          <td style="padding: 6px 4px; font-size:0.8rem; font-weight: 600; white-space: nowrap;">${inc.date}</td>
          <td style="padding: 6px 4px; font-size:0.8rem; line-height: 1.3;">
            <strong>${descText}</strong>
            ${obs}
          </td>
          <td style="padding: 6px 4px; text-align: right;">
            <button type="button" class="btn-delete-incidence" data-date="${inc.date}" style="background: none; border: none; color: var(--danger); cursor: pointer; padding: 2px 6px;" title="Eliminar Incidencia">
              <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
            </button>
          </td>
        </tr>
      `;
    });

    historyContainer.innerHTML = `
      <h4 style="font-size: 0.9rem; font-weight: 600; margin-bottom: 0.5rem; color: #fff;">Incidencias Registradas en la Quincena</h4>
      <table style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr style="border-bottom: 1px solid var(--panel-border); text-align: left;">
            <th style="padding: 4px; font-size: 0.75rem; color: var(--text-muted); width: 25%;">Fecha</th>
            <th style="padding: 4px; font-size: 0.75rem; color: var(--text-muted); width: 60%;">Detalle</th>
            <th style="padding: 4px; text-align: right; font-size: 0.75rem; color: var(--text-muted); width: 15%;">Acciones</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    `;

    if (window.lucide) lucide.createIcons();

    // Register delete click listeners
    historyContainer.querySelectorAll(".btn-delete-incidence").forEach(btn => {
      btn.addEventListener("click", () => {
        const date = btn.getAttribute("data-date");
        if (confirm(`¿Estás seguro de que deseas eliminar la incidencia del día ${date}?`)) {
          deleteIncidence(state.selectedIncidenceEmployeeId, date);
        }
      });
    });
  }

  function deleteIncidence(employeeId, date) {
    fetch(`/api/incidences?employee_id=${encodeURIComponent(employeeId)}&date=${encodeURIComponent(date)}`, {
      method: "DELETE",
      headers: {
        "Authorization": "Bearer " + (localStorage.getItem("rhm_session_token") || "")
      }
    })
      .then(res => {
        if (!res.ok) {
          return res.json().then(d => { throw new Error(d.error || "Error al eliminar incidencia"); });
        }
        return res.json();
      })
      .then(resData => {
        showToast("Incidencia eliminada con éxito.");
        loadState().then(() => {
          loadIncidencesForSelectedEmployee(state.selectedIncidenceEmployeeId);
        });
      })
      .catch(err => {
        console.error("Delete incidence failed:", err);
        showToast(err.message, "error");
      });
  }

  function applyIncidenceValuesForSelectedDate() {
    const dateInput = document.getElementById("inc-fecha");
    if (!dateInput) return;
    const selectedDate = dateInput.value;
    
    // Find incidence for this date
    const inc = (state.currentEmployeeIncidences || []).find(i => i.date === selectedDate);
    
    if (inc) {
      state.currentLoadedVacationsForThisDate = inc.vacaciones || 0;
      document.getElementById("inc-faltas").value = inc.faltas || 0;
      document.getElementById("inc-retardos").value = inc.retardos || 0;
      document.getElementById("inc-vacaciones").value = inc.vacaciones || 0;
      document.getElementById("inc-observaciones").value = inc.observaciones || "";
      
      const pSel = document.getElementById("inc-puntualidad");
      if (pSel) pSel.value = inc.puntualidad || "SI";
      
      const aSel = document.getElementById("inc-asistencia");
      if (aSel) aSel.value = inc.asistencia || "SI";
      
      const forzarAsistEl = document.getElementById("inc-forzar-asistencia");
      if (forzarAsistEl) forzarAsistEl.value = inc.forzar_asistencia || "NO";
      
      const forzarPuntEl = document.getElementById("inc-forzar-puntualidad");
      if (forzarPuntEl) forzarPuntEl.value = inc.forzar_puntualidad || "NO";
      
      const forzarValesEl = document.getElementById("inc-forzar-vales");
      if (forzarValesEl) forzarValesEl.value = inc.forzar_vales || "NO";
      
      const ajusteValesEl = document.getElementById("inc-ajuste-vales");
      if (ajusteValesEl) ajusteValesEl.value = inc.ajuste_vales !== null && inc.ajuste_vales !== undefined ? inc.ajuste_vales : "";
      
      const ajusteFaEl = document.getElementById("inc-ajuste-fondo-ahorro");
      if (ajusteFaEl) ajusteFaEl.value = inc.ajuste_fondo_ahorro !== null && inc.ajuste_fondo_ahorro !== undefined ? inc.ajuste_fondo_ahorro : "";

      // Dynamic deductions
      if (state.schema && state.schema.columns) {
        state.schema.columns.forEach(col => {
          if (col.category === "deduction" && col.incidence_editable) {
            const el = document.getElementById("inc-" + col.field);
            if (el) {
              el.value = inc[col.field] || 0.0;
            }
          }
        });
      }
    } else {
      state.currentLoadedVacationsForThisDate = 0;
      // Reset values
      document.getElementById("inc-faltas").value = 0;
      document.getElementById("inc-retardos").value = 0;
      document.getElementById("inc-vacaciones").value = 0;
      document.getElementById("inc-observaciones").value = "";
      
      const pSel = document.getElementById("inc-puntualidad");
      if (pSel) pSel.value = "SI";
      
      const aSel = document.getElementById("inc-asistencia");
      if (aSel) aSel.value = "SI";
      
      const forzarAsistEl = document.getElementById("inc-forzar-asistencia");
      if (forzarAsistEl) forzarAsistEl.value = "NO";
      
      const forzarPuntEl = document.getElementById("inc-forzar-puntualidad");
      if (forzarPuntEl) forzarPuntEl.value = "NO";
      
      const forzarValesEl = document.getElementById("inc-forzar-vales");
      if (forzarValesEl) forzarValesEl.value = "NO";
      
      const ajusteValesEl = document.getElementById("inc-ajuste-vales");
      if (ajusteValesEl) ajusteValesEl.value = "";
      
      const ajusteFaEl = document.getElementById("inc-ajuste-fondo-ahorro");
      if (ajusteFaEl) ajusteFaEl.value = "";
      
      // Dynamic deductions
      if (state.schema && state.schema.columns) {
        state.schema.columns.forEach(col => {
          if (col.category === "deduction" && col.incidence_editable) {
            const el = document.getElementById("inc-" + col.field);
            if (el) {
              el.value = 0.0;
            }
          }
        });
      }
    }
    
    // Recalculate available vacations label
    const emp = state.employees.find(e => e.id === state.selectedIncidenceEmployeeId);
    if (emp) {
      const vacTot = emp.vacaciones_totales || 0;
      const vacTom = emp.vacaciones_tomadas || 0;
      const dbRestantes = (vacTot - vacTom);
      const currentVacVal = inc ? (inc.vacaciones || 0) : 0;
      const allowedMax = dbRestantes + currentVacVal;
      
      const vacDisponiblesEl = document.getElementById("inc-vacaciones-disponibles-help");
      if (vacDisponiblesEl) {
        vacDisponiblesEl.textContent = `Disponibles: ${allowedMax} días`;
        vacDisponiblesEl.setAttribute("data-restantes", allowedMax);
      }
    }
  }

  const formIncidence = document.getElementById("form-capture-incidence");
  if (formIncidence) {
    formIncidence.addEventListener("submit", (e) => {
      e.preventDefault();
      if (!state.selectedIncidenceEmployeeId) return;

      const faltas = parseInt(document.getElementById("inc-faltas").value) || 0;
      const retardos = parseInt(document.getElementById("inc-retardos").value) || 0;
      const vacaciones = parseInt(document.getElementById("inc-vacaciones").value) || 0;
      
      // Vacation validation warning
      const vacDisponiblesEl = document.getElementById("inc-vacaciones-disponibles-help");
      const vacRestantes = vacDisponiblesEl ? parseFloat(vacDisponiblesEl.getAttribute("data-restantes") || "0") : 0;
      
      if (vacaciones > vacRestantes) {
        if (!confirm(`El colaborador solo cuenta con ${vacRestantes} días de vacaciones disponibles para este ciclo anual. Estás intentando registrar ${vacaciones} días. ¿Deseas continuar?`)) {
          return;
        }
      }
      
      const observaciones = document.getElementById("inc-observaciones").value.trim();
      const puntualidad = document.getElementById("inc-puntualidad") ? document.getElementById("inc-puntualidad").value : "SI";
      const asistencia = document.getElementById("inc-asistencia") ? document.getElementById("inc-asistencia").value : "SI";
      
      const forzarAsistencia = document.getElementById("inc-forzar-asistencia") ? document.getElementById("inc-forzar-asistencia").value : "NO";
      const forzarPuntualidad = document.getElementById("inc-forzar-puntualidad") ? document.getElementById("inc-forzar-puntualidad").value : "NO";
      const forzarVales = document.getElementById("inc-forzar-vales") ? document.getElementById("inc-forzar-vales").value : "NO";
      const ajusteVales = document.getElementById("inc-ajuste-vales") ? document.getElementById("inc-ajuste-vales").value.trim() : "";
      const ajusteFondoAhorro = document.getElementById("inc-ajuste-fondo-ahorro") ? document.getElementById("inc-ajuste-fondo-ahorro").value.trim() : "";

      const dateVal = document.getElementById("inc-fecha") ? document.getElementById("inc-fecha").value : "";
      const payload = {
        id: state.selectedIncidenceEmployeeId,
        date: dateVal,
        faltas,
        retardos,
        vacaciones,
        observaciones,
        puntualidad,
        asistencia,
        forzar_asistencia: forzarAsistencia,
        forzar_puntualidad: forzarPuntualidad,
        forzar_vales: forzarVales,
        ajuste_vales: ajusteVales,
        ajuste_fondo_ahorro: ajusteFondoAhorro
      };

      // Gather dynamic deductions
      if (state.schema && state.schema.columns) {
        state.schema.columns.forEach(col => {
          if (col.category === "deduction" && col.incidence_editable) {
            const el = document.getElementById("inc-" + col.field);
            payload[col.field] = el ? parseFloat(el.value) || 0.0 : 0.0;
          }
        });
      }

      // Backward compatibility mapping for main descuento
      payload.descuento_adicional = payload.descuento_adicional || 0.0;

      fetch("/api/incidences", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": "Bearer " + (localStorage.getItem("rhm_session_token") || "")
        },
        body: JSON.stringify(payload)
      })
        .then(res => res.json())
        .then(resData => {
          if (resData.error) {
            showToast(resData.error, "error");
            return;
          }
          showToast("Incidencias guardadas en Excel con éxito.");
          loadState().then(() => {
            if (state.selectedIncidenceEmployeeId) {
              loadIncidencesForSelectedEmployee(state.selectedIncidenceEmployeeId);
            }
          });
        })
        .catch(err => {
          console.error("Error guardando incidencias:", err);
          showToast("Error al guardar incidencias en Excel. Verifica que el archivo no esté abierto.", "error");
        });
    });
  }

  const incFechaInput = document.getElementById("inc-fecha");
  if (incFechaInput) {
    incFechaInput.addEventListener("change", () => {
      applyIncidenceValuesForSelectedDate();
    });
  }

  // 11. View Rendering - PRE-PAYROLL (DYNAMIC EXCEL SHEET VIEW)
  function renderPrenomina() {
    const table = document.querySelector(".prenomina-table");
    if (!table || !state.schema) return;

    const cols = state.schema.columns;
    const nominalFields = [
      "salario_diario",
      "factor_integracion",
      "sdi",
      "sueldo_nominal",
      "puntualidad",
      "asistencia",
      "vales_despensa",
      "fondo_ahorro",
      "percepcion_sueldos"
    ];
    const nominalCols = cols.filter(c => nominalFields.includes(c.field));
    const otherCols = cols.filter(c => c.category === "others");
    const deductionCols = cols.filter(c => c.category === "deduction");

    // Rebuild the thead dynamically
    let theadHtml = `
      <thead>
        <tr>
          <th rowspan="2">No.</th>
          <th rowspan="2">Cod.</th>
          <th rowspan="2">Empresa</th>
          <th rowspan="2">Nombre Completo</th>
          <th rowspan="2">Fecha Ingreso</th>
          <th rowspan="2">Antigüedad (Años)</th>
          <th rowspan="2" style="background: rgba(16, 185, 129, 0.08); color: #10b981;">Vac. Derecho</th>
          <th rowspan="2" style="background: rgba(16, 185, 129, 0.08); color: #10b981;">Vac. Tomadas</th>
          <th rowspan="2" style="background: rgba(16, 185, 129, 0.08); color: #10b981;">Vac. Restantes</th>
          <th rowspan="2">F.A.?</th>
          <th colspan="${nominalCols.length}">Esquema Nominal IMSS (Cálculos Base)</th>
          <th colspan="${otherCols.length + 1}">Otros Conceptos (Esquemas Base)</th>
          <th rowspan="2">Sueldo Bruto Mensual</th>
          <th rowspan="2">Sueldo Bruto Quincenal</th>
          <th rowspan="2">Descuento Incidencia</th>
          ${deductionCols.map(c => `<th rowspan="2">${c.header || c.label}</th>`).join("")}
          <th rowspan="2">Sueldo Neto Quincenal</th>
          <th rowspan="2">Observaciones</th>
        </tr>
        <tr>
          ${nominalCols.map(c => `<th>${c.header || c.label}</th>`).join("")}
          ${otherCols.map(c => `<th>${c.header || c.label}</th>`).join("")}
          <th>Total Otros</th>
        </tr>
      </thead>
    `;
    
    const originalThead = table.querySelector("thead");
    if (originalThead) {
      originalThead.outerHTML = theadHtml;
    }

    const tbody = table.querySelector("tbody");
    if (!tbody) return;
    tbody.innerHTML = "";

    const totals = {
      sueldoNominal: 0,
      percepcionSueldos: 0,
      totalOtros: 0,
      brutoMensual: 0,
      brutoQuincenal: 0,
      descuentoFaltas: 0,
      netoQuincenal: 0
    };

    // Initialize all dynamic totals
    nominalCols.forEach(c => totals[c.field] = 0);
    otherCols.forEach(c => totals[c.field] = 0);
    deductionCols.forEach(c => totals[c.field] = 0);

    let idx = 1;
    state.employees.forEach(emp => {
      if (state.filterEmployeeIds && !state.filterEmployeeIds.includes(String(emp.id))) {
        return;
      }
      const calc = calculateEmployeePayroll(emp, state.config);
      
      if (calc.isBaja) {
        const chkVerBajas = document.getElementById("chk-ver-bajas");
        const verBajas = chkVerBajas ? chkVerBajas.checked : false;
        if (!verBajas) {
          return; // Skip rendering
        }
      }

      if (!calc.isBaja) {
        totals.percepcionSueldos += calc.percepcionSueldos;
        totals.totalOtros += calc.totalOtros;
        totals.brutoMensual += calc.sueldoBrutoMensual;
        totals.brutoQuincenal += calc.sueldoBrutoQuincenalNormal;
        totals.descuentoFaltas += calc.descuentoFaltas;
        totals.netoQuincenal += calc.sueldoNetoQuincenal;

        nominalCols.forEach(c => {
          const val = calc[c.field] !== undefined ? calc[c.field] : emp[c.field];
          totals[c.field] += val || 0;
        });

        otherCols.forEach(c => {
          totals[c.field] += emp[c.field] || 0;
        });

        deductionCols.forEach(c => {
          totals[c.field] += emp[c.field] || 0;
        });
      }

      const rowClassAttr = calc.isBaja ? 'class="prenomina-baja-row"' : '';
      const faLabel = calc.isBaja ? '-' : (emp.fondo_ahorro_activo ? 'SI' : 'NO');
      
      const vacTot = emp.vacaciones_totales || 0;
      const vacTom = emp.vacaciones_tomadas || 0;
      const vacRest = (vacTot - vacTom);

      const getCellAttrs = (field, extraStyle = '', extraClass = '') => {
        const formula = emp._formulas && emp._formulas[field] ? emp._formulas[field] : null;
        let attrs = `data-field="${field}"`;
        if (formula) {
          attrs += ` data-formula="${formula.replace(/"/g, '&quot;')}"`;
        }
        
        const isDiscrepancy = emp.discrepancies && emp.discrepancies.includes(field);
        if (isDiscrepancy) {
          attrs += ` title="Discrepancia detectada: el valor en el Excel original difiere del cálculo oficial por más de $2.00 pesos."`;
        }
        
        let styleAttr = extraStyle ? `style="${extraStyle}"` : '';
        let classList = [];
        if (extraClass) classList.push(extraClass);
        if (formula) classList.push('has-formula');
        if (isDiscrepancy) classList.push('discrepancy-cell');
        let classAttr = classList.length > 0 ? `class="${classList.join(' ')}"` : '';
        return `${classAttr} ${styleAttr} ${attrs}`.trim();
      };

      let rowHtml = `
        <tr ${rowClassAttr}>
          <td class="align-center">${calc.isBaja ? '-' : idx}</td>
          <td class="align-center" style="font-family:monospace; font-weight:600;" data-field="id">${emp.id}</td>
          <td class="align-center" data-field="empresa">${emp.empresa || '-'}</td>
          <td class="align-left" style="font-weight: 500;" data-field="nombre">
            ${emp.nombre || '-'}
            ${calc.isBaja ? '<span class="badge danger" style="font-size:0.55rem; padding:0.05rem 0.25rem; margin-left:0.25rem;">Baja</span>' : ''}
          </td>
          <td class="align-center" data-field="ingreso">${emp.ingreso || '-'}</td>
          <td ${getCellAttrs('antiguedad', '', 'align-center')}>${calc.antiguedad.toFixed(1)}</td>
          <td ${getCellAttrs('vacaciones_totales', 'background: rgba(16, 185, 129, 0.03); font-weight: 600;', 'align-center')}>${calc.isBaja ? '-' : vacTot}</td>
          <td ${getCellAttrs('vacaciones_tomadas', 'background: rgba(16, 185, 129, 0.03);', 'align-center')}>${calc.isBaja ? '-' : (vacTom > 0 ? vacTom : '-')}</td>
          <td ${getCellAttrs('vacaciones_restantes', `background: rgba(16, 185, 129, 0.03); font-weight: 700; color: ${vacRest <= 0 ? 'var(--danger)' : '#10b981'};`, 'align-center')}>${calc.isBaja ? '-' : vacRest}</td>
          <td ${getCellAttrs('fondo_ahorro_activo', '', 'align-center')}>${faLabel}</td>
      `;

      // Render Nominal columns
      nominalCols.forEach(c => {
        const val = calc[c.field] !== undefined ? calc[c.field] : emp[c.field];
        let formatted = '-';
        let extraClass = '';
        if (val > 0) {
          formatted = c.field === 'factor_integracion' ? val.toFixed(4) : formatNumber(val);
        } else if (val === 0 && emp.salario_diario > 0 && (c.field === 'puntualidad' || c.field === 'asistencia')) {
          formatted = '0.00';
          extraClass = 'overridden-cell';
        }
        rowHtml += `<td ${getCellAttrs(c.field, '', extraClass)}>${formatted}</td>`;
      });

      // Render Others columns
      otherCols.forEach(c => {
        const val = emp[c.field] || 0.0;
        rowHtml += `<td ${getCellAttrs(c.field)}>${val > 0 ? formatNumber(val) : '-'}</td>`;
      });

      // Total otros
      rowHtml += `<td style="font-weight: 600;">${calc.totalOtros > 0 ? formatNumber(calc.totalOtros) : '-'}</td>`;

      // Render sueldos y ajustes row totals
      rowHtml += `
          <td ${getCellAttrs('bruto_mensual', 'font-weight: 600;')}>${calc.sueldoBrutoMensual > 0 ? formatNumber(calc.sueldoBrutoMensual) : '-'}</td>
          <td ${getCellAttrs('bruto_quincenal')}>${calc.sueldoBrutoQuincenalNormal > 0 ? formatNumber(calc.sueldoBrutoQuincenalNormal) : '-'}</td>
          <td class="${calc.descuentoFaltas > 0 ? 'overridden-cell' : ''}">${calc.descuentoFaltas > 0 ? formatNumber(calc.descuentoFaltas) : '-'}</td>
      `;

      // Render dynamic deduction columns
      deductionCols.forEach(c => {
        const val = emp[c.field] || 0.0;
        const extraClass = val > 0 ? 'overridden-cell' : '';
        rowHtml += `<td ${getCellAttrs(c.field, '', extraClass)}>${val > 0 ? formatNumber(val) : '-'}</td>`;
      });

      rowHtml += `
          <td ${getCellAttrs('neto_quincenal', 'font-weight: 700; color: #fff; background: rgba(99,102,241,0.05);')}>${calc.sueldoNetoQuincenal > 0 ? formatNumber(calc.sueldoNetoQuincenal) : '-'}</td>
          <td ${getCellAttrs('observaciones', 'font-size:0.75rem; color: var(--text-muted); max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;', 'align-left')} title="${emp.observaciones || ''}">${emp.observaciones || '-'}</td>
        </tr>
      `;

      tbody.innerHTML += rowHtml;
      if (!calc.isBaja) idx++;
    });

    // Render general sum row
    let sumRowHtml = `
      <tr class="total-row">
        <td colspan="10" class="align-left">TOTALES / SUMAS GENERALES</td>
    `;

    nominalCols.forEach(c => {
      const tVal = totals[c.field];
      sumRowHtml += `<td>${tVal > 0 && c.field !== 'factor_integracion' ? formatNumber(tVal) : '-'}</td>`;
    });

    otherCols.forEach(c => {
      const tVal = totals[c.field];
      sumRowHtml += `<td>${tVal > 0 ? formatNumber(tVal) : '-'}</td>`;
    });

    sumRowHtml += `
      <td>${formatNumber(totals.totalOtros)}</td>
      <td>${formatNumber(totals.brutoMensual)}</td>
      <td>${formatNumber(totals.brutoQuincenal)}</td>
      <td>${formatNumber(totals.descuentoFaltas)}</td>
      ${deductionCols.map(c => `<td>${totals[c.field] > 0 ? formatNumber(totals[c.field]) : '-'}</td>`).join("")}
      <td>${formatNumber(totals.netoQuincenal)}</td>
      <td>-</td>
    </tr>
    `;

    tbody.innerHTML += sumRowHtml;

    // Register click listeners on the rendered rows
    const rows = tbody.querySelectorAll("tr:not(.total-row)");
    rows.forEach(row => {
      // Highlight row if it is the currently selected employee
      const idCell = row.querySelector("td:nth-child(2)");
      if (idCell) {
        const empId = idCell.textContent.trim();
        if (empId === currentAIEmployeeId) {
          row.classList.add("selected-row");
        }
      }
      
      row.addEventListener("click", () => {
        const idCell = row.querySelector("td:nth-child(2)");
        if (!idCell) return;
        const empId = idCell.textContent.trim();
        selectEmployeeForAI(empId, row);
      });
    });
  }

  // 12. View Rendering - CONFIGURATION
  const toggleApiKeyBtn = document.getElementById("toggle-api-key");
  if (toggleApiKeyBtn) {
    toggleApiKeyBtn.addEventListener("click", () => {
      const input = document.getElementById("cfg-ai-key");
      if (!input) return;
      
      const isPassword = input.type === "password";
      input.type = isPassword ? "text" : "password";
      
      toggleApiKeyBtn.innerHTML = `<i data-lucide="${isPassword ? 'eye-off' : 'eye'}"></i>`;
      if (window.lucide) lucide.createIcons();
    });
  }

  const aiProviderSelect = document.getElementById("cfg-ai-provider");
  if (aiProviderSelect) {
    aiProviderSelect.addEventListener("change", (e) => {
      const provider = e.target.value;
      toggleAIProviderModels(provider);
      
      const modelSelect = document.getElementById("cfg-ai-model-select");
      if (modelSelect) {
        if (provider === "openrouter") {
          modelSelect.value = "meta-llama/llama-3.3-70b-instruct:free";
        } else if (provider === "google") {
          modelSelect.value = "gemini-2.5-flash";
        }
        modelSelect.dispatchEvent(new Event("change"));
      }
    });
  }



  const aiModelSelect = document.getElementById("cfg-ai-model-select");
  if (aiModelSelect) {
    aiModelSelect.addEventListener("change", (e) => {
      const customGroup = document.getElementById("cfg-ai-model-custom-group");
      if (customGroup) {
        customGroup.style.display = e.target.value === "custom" ? "flex" : "none";
      }
    });
  }

  const formConfig = document.getElementById("form-config");
  if (formConfig) {
    formConfig.addEventListener("submit", (e) => {
      e.preventDefault();
      const db_path = document.getElementById("cfg-db-path").value.trim();
      const uma = parseFloat(document.getElementById("cfg-uma").value) || 117.31;
      const vales_pct = parseFloat(document.getElementById("cfg-vales-pct").value) || 40;
      const dias_mes = parseFloat(document.getElementById("cfg-dias-mes").value) || 30.4;
      const fa_pct = parseFloat(document.getElementById("cfg-fa-pct").value) || 11;
      const aguinaldo = parseFloat(document.getElementById("cfg-aguinaldo").value) || 15;
      const prima = parseFloat(document.getElementById("cfg-prima").value) || 25;
      
      const ai_provider = document.getElementById("cfg-ai-provider") ? document.getElementById("cfg-ai-provider").value : "google";
      const modelSelectVal = document.getElementById("cfg-ai-model-select") ? document.getElementById("cfg-ai-model-select").value : "gemini-2.5-flash";
      const ai_model = modelSelectVal === "custom" 
        ? (document.getElementById("cfg-ai-model-custom") ? document.getElementById("cfg-ai-model-custom").value.trim() : "gemini-2.5-flash")
        : modelSelectVal;
      const rules = document.getElementById("cfg-payroll-rules") ? document.getElementById("cfg-payroll-rules").value : "";
 
      if (db_path.toLowerCase().endsWith(".pages")) {
        showToast("Apple Pages (.pages) es un procesador de textos. Por favor, exporta el archivo a Excel (.xlsx) o CSV (.csv) para conectarlo como base de datos.", "error");
        return;
      }
      if (db_path.toLowerCase().endsWith(".numbers")) {
        showToast("Apple Numbers (.numbers) es un formato cerrado de Apple. Por favor, exporta el archivo a Excel (.xlsx) o CSV (.csv) para poder usarlo.", "error");
        return;
      }
 
      fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uma: uma,
          vales_pct: vales_pct,
          dias_mes: dias_mes,
          fa_pct: fa_pct,
          aguinaldo: aguinaldo,
          prima: prima,
          db_path: db_path,
          payroll_rules: rules,
          ai_provider: ai_provider,
          ai_model: ai_model
        })
      })
        .then(res => res.json())
        .then(resData => {
          if (resData.error) {
            showToast(resData.error, "error");
            return;
          }
          
          showToast("Configuración guardada con éxito.");
          loadState();
        })
        .catch(err => {
          console.error("Error guardando config:", err);
          showToast("Error al escribir configuración. ¿Está abierto o bloqueado el archivo?", "error");
        });
    });
  }

  // 12b. File upload for payroll rules (via native OS dialog for Pywebview compatibility)
  const btnLoadRulesFile = document.getElementById("btn-load-rules-file");
  if (btnLoadRulesFile) {
    const rulesFileInput = document.createElement("input");
    rulesFileInput.type = "file";
    rulesFileInput.accept = ".docx,.txt";
    rulesFileInput.style.display = "none";
    document.body.appendChild(rulesFileInput);

    btnLoadRulesFile.addEventListener("click", () => {
      rulesFileInput.value = "";
      rulesFileInput.click();
    });

    rulesFileInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;

      showToast("Leyendo archivo de reglas...", "info");
      const formData = new FormData();
      formData.append("file", file);

      fetch("/api/upload-rules?_t=" + Date.now(), {
        method: "POST",
        body: formData
      })
        .then(res => {
          if (!res.ok) {
            return res.json().then(d => { throw new Error(d.error || "Error al leer archivo"); });
          }
          return res.json();
        })
        .then(data => {
          if (data.text) {
            const rulesTextArea = document.getElementById("cfg-payroll-rules");
            if (rulesTextArea) {
              rulesTextArea.value = data.text;
              showToast("Reglas de nómina cargadas con éxito.");
            }
          }
        })
        .catch(err => {
          console.error("Error al cargar reglas:", err);
          showToast(err.message || "Error al procesar el archivo de reglas.", "error");
        });
    });
  }



  const btnSelectDbPath = document.getElementById("btn-select-db-path");
  if (btnSelectDbPath) {
    const dbFileInput = document.createElement("input");
    dbFileInput.type = "file";
    dbFileInput.accept = ".xlsx,.csv";
    dbFileInput.style.display = "none";
    document.body.appendChild(dbFileInput);

    btnSelectDbPath.addEventListener("click", () => {
      dbFileInput.value = "";
      dbFileInput.click();
    });

    dbFileInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;

      showToast("Subiendo y procesando base de datos...", "info");
      const formData = new FormData();
      formData.append("file", file);

      fetch("/api/upload-database?_t=" + Date.now(), {
        method: "POST",
        body: formData
      })
        .then(res => {
          if (!res.ok) {
            return res.json().then(d => { throw new Error(d.error || "Error al subir archivo"); });
          }
          return res.json();
        })
        .then(data => {
          if (data.selected_path) {
            const dbPathInput = document.getElementById("cfg-db-path");
            if (dbPathInput) {
              dbPathInput.value = data.selected_path;
            }
            openSchemaValidationModal(data.selected_path);
          } else {
            showToast("Selección de archivo cancelada.", "info");
          }
        })
        .catch(err => {
          console.error("Error al subir archivo de base de datos:", err);
          showToast(err.message || "Error al subir el archivo.", "error");
        });
    });
  }

  function renderConfig() {
    const dbPathInput = document.getElementById("cfg-db-path");
    if (dbPathInput) {
      dbPathInput.value = state.db_path || "Nomina ciega.xlsx";
    }
    document.getElementById("cfg-uma").value = state.config.uma;
    document.getElementById("cfg-vales-pct").value = state.config.valesPct;
    document.getElementById("cfg-dias-mes").value = state.config.diasMes;
    document.getElementById("cfg-fa-pct").value = state.config.faPct;
    document.getElementById("cfg-aguinaldo").value = state.config.aguinaldo;
    document.getElementById("cfg-prima").value = state.config.prima;

    const rulesTextArea = document.getElementById("cfg-payroll-rules");
    if (rulesTextArea && state.schema) {
      rulesTextArea.value = state.schema.payroll_rules || "";
    }

    // Highlight missing inputs
    const missingLft = state.config_status?.missing_lft_params || [];
    const fieldsMap = {
      "cfg-uma": "UMA 2026",
      "cfg-vales-pct": "Porcentaje Vales",
      "cfg-dias-mes": "Factor Días Mes",
      "cfg-fa-pct": "Fondo de Ahorro %",
      "cfg-aguinaldo": "Días Aguinaldo",
      "cfg-prima": "Prima Vacacional %"
    };
    
    Object.keys(fieldsMap).forEach(id => {
      const input = document.getElementById(id);
      if (input) {
        const paramName = fieldsMap[id];
        if (missingLft.includes(paramName)) {
          input.style.border = "2px solid var(--error)";
          input.style.boxShadow = "0 0 10px rgba(239, 68, 68, 0.2)";
        } else {
          input.style.border = "";
          input.style.boxShadow = "";
        }
      }
    });
  }

  // 13. Modal Handle: Alta / Edición Colaboradores
  const modal = document.getElementById("modal-collaborator");
  const btnAdd = document.getElementById("btn-add-collaborator");
  const btnClose = document.getElementById("modal-close-btn");
  const btnCancel = document.getElementById("modal-cancel-btn");
  const formColl = document.getElementById("form-collaborator");
  
  const checkNominal = document.getElementById("check-nominal");
  const groupSalarioDiario = document.getElementById("group-salario-diario");
  const groupFAToggle = document.getElementById("group-fa-toggle");

  if (checkNominal) {
    checkNominal.addEventListener("change", () => {
      const isChecked = checkNominal.checked;
      groupSalarioDiario.style.opacity = isChecked ? "1" : "0.4";
      document.getElementById("col-salario-diario").disabled = !isChecked;
      groupFAToggle.style.opacity = isChecked ? "1" : "0.4";
      document.getElementById("col-fa-activo").disabled = !isChecked;
    });
  }

  if (btnAdd) {
    btnAdd.addEventListener("click", () => {
      openCollaboratorModal(null);
    });
  }

  [btnClose, btnCancel].forEach(btn => {
    if (btn) {
      btn.addEventListener("click", () => {
        modal.classList.remove("active");
      });
    }
  });

  function openCollaboratorModal(id = null) {
    modal.classList.add("active");
    formColl.reset();
    
    if (id) {
      document.getElementById("modal-title").textContent = "Editar Esquema del Colaborador";
      const emp = state.employees.find(e => e.id === id);
      if (!emp) return;

      document.getElementById("edit-col-index").value = id;
      document.getElementById("col-no").value = emp.no || "";
      document.getElementById("col-cod").value = emp.id;
      document.getElementById("col-cod").readOnly = true;
      document.getElementById("col-nombre").value = emp.nombre;
      document.getElementById("col-empresa").value = emp.empresa;
      document.getElementById("col-area").value = emp.area;
      document.getElementById("col-depto").value = emp.depto;
      document.getElementById("col-puesto").value = emp.puesto;
      document.getElementById("col-lugar").value = emp.lugar;
      document.getElementById("col-ingreso").value = emp.ingreso;
      document.getElementById("col-baja").value = emp.baja || "";

      const hasNominal = emp.salario_diario > 0;
      checkNominal.checked = hasNominal;
      document.getElementById("col-salario-diario").value = emp.salario_diario || 0.0;
      document.getElementById("col-salario-diario").disabled = !hasNominal;
      document.getElementById("col-fa-activo").checked = emp.fondo_ahorro_activo || false;
      document.getElementById("col-fa-activo").disabled = !hasNominal;
      
      groupSalarioDiario.style.opacity = hasNominal ? "1" : "0.4";
      groupFAToggle.style.opacity = hasNominal ? "1" : "0.4";

      // Fill other dynamic columns
      if (state.schema && state.schema.columns) {
        state.schema.columns.forEach(col => {
          if (col.category === "others" && col.editable) {
            const el = document.getElementById("col-" + col.field);
            if (el) {
              el.value = emp[col.field] || 0.0;
            }
          }
        });
      }
    } else {
      document.getElementById("modal-title").textContent = "Dar de Alta Colaborador";
      document.getElementById("edit-col-index").value = "";
      document.getElementById("col-cod").value = "";
      document.getElementById("col-cod").readOnly = false;
      
      checkNominal.checked = true;
      document.getElementById("col-salario-diario").disabled = false;
      document.getElementById("col-fa-activo").disabled = false;
      groupSalarioDiario.style.opacity = "1";
      groupFAToggle.style.opacity = "1";

      if (state.schema && state.schema.columns) {
        state.schema.columns.forEach(col => {
          if (col.category === "others" && col.editable) {
            const el = document.getElementById("col-" + col.field);
            if (el) el.value = 0.0;
          }
        });
      }
    }
  }

  if (formColl) {
    formColl.addEventListener("submit", (e) => {
      e.preventDefault();
      const id = document.getElementById("edit-col-index").value;
      const cod = document.getElementById("col-cod").value.trim();

      if (!id) {
        const exists = state.employees.some(emp => emp.id === cod);
        if (exists) {
          showToast(`El código checador ${cod} ya existe en Excel.`, "error");
          return;
        }
      }

      const data = {
        id: cod,
        no: document.getElementById("col-no").value.trim(),
        nombre: document.getElementById("col-nombre").value.trim(),
        empresa: document.getElementById("col-empresa").value,
        area: document.getElementById("col-area").value.trim(),
        depto: document.getElementById("col-depto").value.trim(),
        puesto: document.getElementById("col-puesto").value.trim(),
        lugar: document.getElementById("col-lugar").value.trim(),
        ingreso: document.getElementById("col-ingreso").value,
        baja: document.getElementById("col-baja").value || null,
        fondo_ahorro_activo: checkNominal.checked ? document.getElementById("col-fa-activo").checked : false,
        salario_diario: checkNominal.checked ? parseFloat(document.getElementById("col-salario-diario").value) || 0 : 0
      };

      // Gather other dynamic payments
      if (state.schema && state.schema.columns) {
        state.schema.columns.forEach(col => {
          if (col.category === "others" && col.editable) {
            const el = document.getElementById("col-" + col.field);
            data[col.field] = el ? parseFloat(el.value) || 0.0 : 0.0;
          }
        });
      }

      const isEdit = !!id;
      fetch("/api/collaborator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      })
        .then(res => res.json())
        .then(resData => {
          if (resData.error) {
            showToast(resData.error, "error");
            return;
          }
          showToast(isEdit ? "Cambios guardados en Excel con éxito." : "Colaborador insertado físicamente en Excel.");
          modal.classList.remove("active");
          loadState();
        })
        .catch(err => {
          console.error("Error al guardar colaborador:", err);
          showToast("Error al escribir colaborador en Excel. Asegúrate de cerrar el archivo si lo tienes abierto.", "error");
        });
    });
  }

  // Toggle Status: Alta / Baja
  function toggleCollaboratorStatus(id) {
    const emp = state.employees.find(e => e.id === id);
    if (!emp) return;

    const isCurrentlyBaja = emp.baja !== null && emp.baja !== undefined && emp.baja !== "";
    const updatedBaja = isCurrentlyBaja ? null : new Date().toISOString().split("T")[0];
    
    const updatedData = { ...emp, baja: updatedBaja };

    fetch("/api/collaborator", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updatedData)
    })
      .then(res => res.json())
      .then(resData => {
        if (resData.error) {
          showToast(resData.error, "error");
          return;
        }
        showToast(isCurrentlyBaja ? ` ha reingresado en Excel.` : ` ha sido dado de baja en Excel.`);
        loadState();
      })
      .catch(err => {
        console.error("Error cambiando estado:", err);
        showToast("Error al actualizar estado en Excel. ¿Está bloqueado el archivo?", "error");
      });
  }





  const btnDownloadExcel = document.getElementById("btn-download-excel");
  if (btnDownloadExcel) {
    btnDownloadExcel.addEventListener("click", () => {
      const token = localStorage.getItem("rhm_session_token") || "";
      const link = document.createElement("a");
      link.href = `/api/download-excel?token=${encodeURIComponent(token)}`;
      // Do not set link.download so the browser respects the Content-Disposition header filename from the server
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast("Descargando archivo Excel...");
    });
  }

  // 15. Theme Toggle Logic
  const themeToggle = document.getElementById("theme-toggle");
  const sunIcon = document.querySelector(".sun-icon");
  const moonIcon = document.querySelector(".moon-icon");

  if (themeToggle) {
    const currentTheme = localStorage.getItem("rhm_theme") || "dark";
    document.documentElement.setAttribute("data-theme", currentTheme);
    updateThemeIcons(currentTheme);

    themeToggle.addEventListener("click", () => {
      const theme = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", theme);
      localStorage.setItem("rhm_theme", theme);
      updateThemeIcons(theme);
      showToast(`Modo ${theme === 'dark' ? 'oscuro' : 'claro'} activado.`);
    });
  }

  function updateThemeIcons(theme) {
    if (!sunIcon || !moonIcon) return;
    if (theme === "dark") {
      sunIcon.style.display = "block";
      moonIcon.style.display = "none";
    } else {
      sunIcon.style.display = "none";
      moonIcon.style.display = "block";
    }
  }

  // 15B. AUTH & RBAC IMPLEMENTATION
  function applyRoleBasedUI() {
    const role = localStorage.getItem("rhm_user_role") || "capturista";
    const username = localStorage.getItem("rhm_username") || "Usuario";
    
    // Header user info
    const headerUserInfo = document.getElementById("header-user-info");
    if (headerUserInfo) {
      headerUserInfo.style.display = "flex";
    }

    // Role restrictions
    const configTabBtn = document.querySelector('.nav-links button[data-target="config"]');
    const downloadExcelBtn = document.getElementById("btn-download-excel");
    const addCollabBtn = document.getElementById("btn-add-collaborator");
    const userMgmtBox = document.getElementById("user-management-box");

    if (role === "capturista") {
      if (configTabBtn) configTabBtn.style.display = "none";
      if (downloadExcelBtn) downloadExcelBtn.style.display = "none";
      if (addCollabBtn) addCollabBtn.style.display = "none";
      if (userMgmtBox) userMgmtBox.style.display = "none";
      
      // If currently on config tab, switch to dashboard
      if (state.activeTab === "config") {
        switchTab("dashboard");
      }
    } else {
      if (configTabBtn) configTabBtn.style.display = "inline-flex";
      if (downloadExcelBtn) downloadExcelBtn.style.display = "inline-flex";
      if (addCollabBtn) addCollabBtn.style.display = "inline-flex";
      if (userMgmtBox) {
        userMgmtBox.style.display = "block";
        loadUsers();
      }
    }
  }

  function switchTab(targetTab) {
    const navItem = document.querySelector(`.nav-item[data-target="${targetTab}"]`);
    if (navItem) {
      navItem.click();
    }
  }

  // Login form handler
  const formLogin = document.getElementById("form-login");
  if (formLogin) {
    formLogin.addEventListener("submit", (e) => {
      e.preventDefault();
      const usernameInput = document.getElementById("login-username");
      const passwordInput = document.getElementById("login-password");
      
      const username = usernameInput.value.trim();
      const password = passwordInput.value;
      
      fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      })
      .then(res => {
        if (!res.ok) {
          throw new Error("Usuario o contraseña incorrectos");
        }
        return res.json();
      })
      .then(data => {
        localStorage.setItem("rhm_session_token", data.token);
        localStorage.setItem("rhm_user_role", data.role);
        localStorage.setItem("rhm_username", data.username);
        
        usernameInput.value = "";
        passwordInput.value = "";
        
        hideLoginScreen();
        applyRoleBasedUI();
        loadState();
        showToast(`Sesión iniciada como ${data.username}`);
      })
      .catch(err => {
        console.error("Login failed:", err);
        showToast(err.message, "error");
      });
    });
  }

  // Logout button handler
  const btnLogout = document.getElementById("btn-logout");
  if (btnLogout) {
    btnLogout.addEventListener("click", () => {
      fetch("/api/logout", { method: "POST" })
      .finally(() => {
        localStorage.removeItem("rhm_session_token");
        localStorage.removeItem("rhm_user_role");
        localStorage.removeItem("rhm_username");
        
        const headerUserInfo = document.getElementById("header-user-info");
        if (headerUserInfo) headerUserInfo.style.display = "none";
        
        showLoginScreen();
        showToast("Sesión cerrada");
      });
    });
  }



  // Create user form handler
  const formCreateUser = document.getElementById("form-create-user");
  if (formCreateUser) {
    formCreateUser.addEventListener("submit", (e) => {
      e.preventDefault();
      const newUsernameInput = document.getElementById("new-username");
      const newPasswordInput = document.getElementById("new-password");
      const newRoleSelect = document.getElementById("new-role");
      
      const username = newUsernameInput.value.trim();
      const password = newPasswordInput.value;
      const role = newRoleSelect.value;
      
      fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, role })
      })
      .then(res => {
        if (!res.ok) {
          return res.json().then(d => { throw new Error(d.error || "Error guardando usuario"); });
        }
        return res.json();
      })
      .then(() => {
        newUsernameInput.value = "";
        newPasswordInput.value = "";
        showToast("Usuario guardado con éxito");
        loadUsers();
      })
      .catch(err => {
        console.error("Create user failed:", err);
        showToast(err.message, "error");
      });
    });
  }

  function loadUsers() {
    const listTable = document.getElementById("users-list-table");
    if (!listTable) return;
    
    fetch("/api/users")
    .then(res => {
      if (!res.ok) throw new Error("Error cargando usuarios");
      return res.json();
    })
    .then(users => {
      listTable.innerHTML = "";
      if (users.length === 0) {
        listTable.innerHTML = `<tr><td colspan="3" style="text-align: center; color: var(--text-muted);">No hay usuarios registrados</td></tr>`;
        return;
      }
      
      users.forEach(u => {
        const tr = document.createElement("tr");
        const isSelf = u.username === localStorage.getItem("rhm_username");
        
        tr.innerHTML = `
          <td><strong></strong> ${isSelf ? '<span class="badge info" style="font-size: 0.7rem; padding: 2px 6px; margin-left: 5px;">Tú</span>' : ''}</td>
          <td><span class="user-badge ${u.role === 'admin' ? 'admin' : 'capturista'}">${u.role === 'admin' ? 'Administrador' : 'Capturista'}</span></td>
          <td style="text-align: center;">
            ${isSelf ? '-' : `
              <button class="btn-delete-user-row delete-user-btn" data-username="" title="Eliminar usuario">
                <i data-lucide="trash-2" style="width: 16px; height: 16px;"></i>
              </button>
            `}
          </td>
        `;
        listTable.appendChild(tr);
      });
      
      if (window.lucide) lucide.createIcons();
      
      listTable.querySelectorAll(".delete-user-btn").forEach(btn => {
        btn.addEventListener("click", () => {
          const username = btn.getAttribute("data-username");
          if (confirm(`¿Estás seguro de que deseas eliminar al usuario "${username}"?`)) {
            fetch(`/api/users?username=${encodeURIComponent(username)}`, { method: "DELETE" })
            .then(res => {
              if (!res.ok) {
                return res.json().then(d => { throw new Error(d.error || "Error al eliminar usuario"); });
              }
              return res.json();
            })
            .then(() => {
              showToast(`Usuario "${username}" eliminado`);
              loadUsers();
            })
            .catch(err => {
              console.error("Delete user failed:", err);
              showToast(err.message, "error");
            });
          }
        });
      });
    })
    .catch(err => {
      console.error("Load users failed:", err);
    });
  }

  // 16. Formatter helpers
  function formatCurrency(val) {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(val);
  }

  function formatNumber(val) {
    return new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val);
  }

  // 17. Initialize Application
  const sessionToken = localStorage.getItem("rhm_session_token");
  if (!sessionToken) {
    showLoginScreen();
  } else {
    hideLoginScreen();
    applyRoleBasedUI();
    loadState();
  }

  // 18. AI Explainer Sidebar Integration
  let currentAIEmployeeId = null;
  let aiChatHistory = [];

  const closeSidebarBtn = document.getElementById("btn-close-ai-sidebar");
  if (closeSidebarBtn) {
    closeSidebarBtn.addEventListener("click", closeAISidebar);
  }

  const aiChatInputElement = document.getElementById("ai-chat-input");
  const aiChatSendBtn = document.getElementById("btn-ai-chat-send");
  if (aiChatSendBtn && aiChatInputElement) {
    aiChatSendBtn.addEventListener("click", sendAIChatMessage);
    aiChatInputElement.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        sendAIChatMessage();
      }
    });
  }

  function selectEmployeeForAI(empId, rowElement) {
    // If already selected, do nothing
    if (currentAIEmployeeId === empId) return;

    // Highlight row
    const tbody = document.getElementById("prenomina-table-body");
    if (tbody) {
      tbody.querySelectorAll("tr").forEach(tr => tr.classList.remove("selected-row"));
    }
    if (rowElement) {
      rowElement.classList.add("selected-row");
    }

    currentAIEmployeeId = empId;
    aiChatHistory = []; // Reset history

    const sidebar = document.getElementById("prenomina-ai-sidebar");
    const nameDiv = document.getElementById("ai-collab-name");
    const detailsDiv = document.getElementById("ai-collab-details");
    const messagesDiv = document.getElementById("ai-chat-messages");
    const chatInput = document.getElementById("ai-chat-input");
    const chatSendBtn = document.getElementById("btn-ai-chat-send");
    const badge = document.getElementById("ai-rules-badge");

    if (sidebar) sidebar.classList.add("active");

    const emp = state.employees.find(e => e.id === empId);
    if (emp) {
      if (nameDiv) nameDiv.textContent = emp.nombre || "Colaborador sin Nombre";
      if (detailsDiv) detailsDiv.textContent = `Cód: ${emp.id} | Ingreso: ${emp.ingreso || '-'} | SD: $${formatNumber(emp.salario_diario)}`;
    } else {
      if (nameDiv) nameDiv.textContent = `Colaborador ${empId}`;
      if (detailsDiv) detailsDiv.textContent = `Cód: ${empId}`;
    }

    if (messagesDiv) {
      messagesDiv.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 10px; padding: 2rem;">
          <div class="ai-typing-indicator">
            <div class="ai-typing-dot"></div>
            <div class="ai-typing-dot"></div>
            <div class="ai-typing-dot"></div>
          </div>
          <p style="font-size: 0.8rem; color: var(--text-muted); margin: 0;">Analizando datos del colaborador y generando desglose...</p>
        </div>
      `;
    }

    if (chatInput) {
      chatInput.disabled = true;
      chatInput.value = "";
    }
    if (chatSendBtn) chatSendBtn.disabled = true;

    // Load initial explanation
    fetch("/api/payroll/explain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employee_id: empId,
        chat_history: [],
        new_message: ""
      })
    })
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          if (messagesDiv) {
            messagesDiv.innerHTML = `<div class="chat-message assistant" style="color: var(--danger);"><p>Error: </p></div>`;
          }
          return;
        }

        // Set rules badge
        if (badge) {
          if (data.offline) {
            badge.textContent = "Offline / Local";
            badge.className = "badge rules-badge-offline";
          } else if (data.rules_source === "custom") {
            badge.textContent = "Reglas Empresa";
            badge.className = "badge rules-badge-custom";
          } else {
            badge.textContent = "Reglas Oficiales LFT";
            badge.className = "badge rules-badge-official";
          }
        }

        if (messagesDiv) {
          messagesDiv.innerHTML = "";
        }
        appendAssistantMessage(data.response);

        if (chatInput) chatInput.disabled = false;
        if (chatSendBtn) chatSendBtn.disabled = false;
        if (chatInput) chatInput.focus();
        
        if (window.lucide) lucide.createIcons();
      })
      .catch(err => {
        console.error("Error fetching explanation:", err);
        if (messagesDiv) {
          messagesDiv.innerHTML = `<div class="chat-message assistant" style="color: var(--danger);"><p>Error de conexión al obtener la explicación.</p></div>`;
        }
      });
  }

  function appendAssistantMessage(text) {
    const messagesDiv = document.getElementById("ai-chat-messages");
    if (!messagesDiv) return;
    
    // Strip any markdown code blocks containing AI instructions or JSON results (apply_changes, filter_employee_ids)
    let cleanText = text || "";
    cleanText = cleanText.replace(/```(?:json)?\s*[\s\S]*?(?:"apply_changes"|"filter_employee_ids")[\s\S]*?```/gi, "");
    cleanText = cleanText.trim();

    const formatted = formatMarkdown(cleanText);
    const msgElement = document.createElement("div");
    msgElement.className = "chat-message assistant";
    msgElement.innerHTML = formatted;
    messagesDiv.appendChild(msgElement);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
    
    aiChatHistory.push({ role: "model", text: text });
  }

  function appendUserMessage(text) {
    const messagesDiv = document.getElementById("ai-chat-messages");
    if (!messagesDiv) return;
    
    const msgElement = document.createElement("div");
    msgElement.className = "chat-message user";
    msgElement.innerHTML = `<p>${text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`;
    messagesDiv.appendChild(msgElement);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;

    aiChatHistory.push({ role: "user", text: text });
  }

  function sendAIChatMessage() {
    const chatInput = document.getElementById("ai-chat-input");
    const messagesDiv = document.getElementById("ai-chat-messages");
    const chatSendBtn = document.getElementById("btn-ai-chat-send");
    
    if (!chatInput) return;
    const msgText = chatInput.value.trim();

    if (!msgText || !currentAIEmployeeId) return;

    appendUserMessage(msgText);
    chatInput.value = "";
    
    chatInput.disabled = true;
    if (chatSendBtn) chatSendBtn.disabled = true;
    
    const loadingIndicator = document.createElement("div");
    loadingIndicator.id = "ai-typing-loader";
    loadingIndicator.className = "chat-message assistant";
    loadingIndicator.innerHTML = `
      <div class="ai-typing-indicator">
        <div class="ai-typing-dot"></div>
        <div class="ai-typing-dot"></div>
        <div class="ai-typing-dot"></div>
      </div>
    `;
    if (messagesDiv) {
      messagesDiv.appendChild(loadingIndicator);
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }

    fetch("/api/payroll/explain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employee_id: currentAIEmployeeId,
        chat_history: aiChatHistory.slice(0, -1), // Everything except user newly appended message to avoid duplication in history mapping
        new_message: msgText
      })
    })
      .then(res => res.json())
      .then(data => {
        const loader = document.getElementById("ai-typing-loader");
        if (loader) loader.remove();

        if (data.error) {
          if (messagesDiv) {
            messagesDiv.innerHTML += `<div class="chat-message assistant" style="color: var(--danger);"><p>Error: </p></div>`;
          }
          return;
        }

        appendAssistantMessage(data.response);

        if (data.filter_employee_ids && data.filter_employee_ids.length > 0) {
          state.filterEmployeeIds = data.filter_employee_ids;
          const filterBadge = document.getElementById("prenomina-filter-badge");
          if (filterBadge) filterBadge.style.display = "inline-flex";
          renderPrenomina();
        }

        if (data.proposed_changes) {
          const confirmBox = document.createElement("div");
          confirmBox.className = "chat-message assistant";
          const changesJson = JSON.stringify(data.proposed_changes).replace(/'/g, "\\'");
          
          let changesHtml = "";
          const changesList = Array.isArray(data.proposed_changes) ? data.proposed_changes : [data.proposed_changes];
          changesList.forEach(item => {
            let details = [];
            if (item.faltas !== undefined && item.faltas !== 0) details.push(`Faltas: ${item.faltas}`);
            if (item.retardos !== undefined && item.retardos !== 0) details.push(`Retardos: ${item.retardos}`);
            if (item.vacaciones !== undefined && item.vacaciones !== 0) details.push(`Vacaciones: ${item.vacaciones}`);
            if (item.descuento_adicional !== undefined && item.descuento_adicional !== 0) details.push(`Descuento Adicional: $${parseFloat(item.descuento_adicional).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`);
            if (item.observaciones) details.push(`Obs: "${item.observaciones}"`);
            
            // Check dynamic deductions in schema if they have values
            if (state.schema && state.schema.columns) {
              state.schema.columns.forEach(col => {
                if (col.category === "deduction" && col.incidence_editable && col.field !== "descuento_adicional") {
                  const val = item[col.field];
                  if (val !== undefined && val !== 0) {
                    details.push(`${col.label || col.header}: $${parseFloat(val).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`);
                  }
                }
              });
            }
            
            changesHtml += `<div style="margin-bottom: 6px; padding: 4px; border-bottom: 1px dashed var(--border-color); line-height: 1.4;">
              <strong>${item.nombre || 'Colaborador'}</strong> (Cód: ${item.id})<br>
              <span style="font-size: 0.9em; color: var(--text-muted);">${details.join(" | ") || 'Sin modificaciones numéricas'}</span>
            </div>`;
          });

          confirmBox.innerHTML = `
            <div style="background: var(--bg-card); border: 1px solid var(--border-color); padding: 1rem; border-radius: 8px; margin-top: 10px;">
              <strong style="display: block; margin-bottom: 8px; color: var(--primary);">La IA propone los siguientes cambios en la prenómina:</strong>
              <div style="font-size: 0.95em; background: var(--bg-body); padding: 0.75rem; border-radius: 6px; margin-bottom: 12px; max-height: 200px; overflow-y: auto;">
                ${changesHtml}
              </div>
              <button class="btn btn-primary" style="width: 100%;" onclick='applyAIProposedChanges(${changesJson})'>Confirmar y Aplicar</button>
            </div>
          `;
          if (messagesDiv) {
             messagesDiv.appendChild(confirmBox);
             messagesDiv.scrollTop = messagesDiv.scrollHeight;
          }
        } else if (data.applied_changes) {
          showToast("Se aplicaron las incidencias solicitadas a través de la IA.", "success");
          if (currentAIEmployeeId && currentAIEmployeeId !== "GLOBAL") {
            state.selectedIncidenceEmployeeId = currentAIEmployeeId;
            loadState().then(() => {
              selectIncidenceEmployee(currentAIEmployeeId);
            });
          } else {
            loadState();
          }
        }
        
        chatInput.disabled = false;
        if (chatSendBtn) chatSendBtn.disabled = false;
        chatInput.focus();
        
        if (window.lucide) lucide.createIcons();
      })
      .catch(err => {
        console.error("Error sending chat query:", err);
        const loader = document.getElementById("ai-typing-loader");
        if (loader) loader.remove();
        if (messagesDiv) {
          messagesDiv.innerHTML += `<div class="chat-message assistant" style="color: var(--danger);"><p>Error de conexión al enviar tu pregunta.</p></div>`;
        }
        chatInput.disabled = false;
        if (chatSendBtn) chatSendBtn.disabled = false;
      });
  }

  function closeAISidebar() {
    currentAIEmployeeId = null;
    aiChatHistory = [];
    
    const tbody = document.getElementById("prenomina-table-body");
    if (tbody) {
      tbody.querySelectorAll("tr").forEach(tr => tr.classList.remove("selected-row"));
    }

    const sidebar = document.getElementById("prenomina-ai-sidebar");
    if (sidebar) sidebar.classList.remove("active");

    const nameDiv = document.getElementById("ai-collab-name");
    const detailsDiv = document.getElementById("ai-collab-details");
    const messagesDiv = document.getElementById("ai-chat-messages");
    if (nameDiv) nameDiv.textContent = "Selecciona un colaborador";
    if (detailsDiv) detailsDiv.textContent = "Haz clic en una fila para ver el desglose";
    if (messagesDiv) {
      messagesDiv.innerHTML = `
        <div class="ai-chat-placeholder">
          <i data-lucide="message-square" style="width: 32px; height: 32px; margin-bottom: 8px; color: var(--text-muted); opacity: 0.5;"></i>
          <p style="margin: 0; font-size: 0.85rem; color: var(--text-muted); line-height: 1.4;">Haz clic en cualquier colaborador de la tabla de la izquierda para ver la explicación matemática detallada de su nómina.</p>
        </div>
      `;
    }
    
    if (aiChatInputElement) {
      aiChatInputElement.disabled = true;
      aiChatInputElement.value = "";
    }
    if (aiChatSendBtn) aiChatSendBtn.disabled = true;
    
    if (window.lucide) lucide.createIcons();
  }

  function formatMarkdown(text) {
    if (!text) return "";
    
    let html = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    html = parseMarkdownTables(html);

    html = html.replace(/^### (.*?)$/gm, '<h4 style="margin: 10px 0 5px 0; font-size: 0.95rem; font-weight: 600; color: #fff;">$1</h4>');
    html = html.replace(/^#### (.*?)$/gm, '<h5 style="margin: 8px 0 4px 0; font-size: 0.88rem; font-weight: 600; color: #fff;">$1</h5>');
    
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    
    let inList = false;
    const lines = html.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith("- ") || line.startsWith("* ")) {
        const content = line.substring(2);
        if (!inList) {
          lines[i] = '<ul style="margin: 5px 0; padding-left: 15px; list-style-type: disc;">\n<li style="margin-bottom: 3px;">' + content + '</li>';
          inList = true;
        } else {
          lines[i] = '<li style="margin-bottom: 3px;">' + content + '</li>';
        }
      } else {
        if (inList) {
          lines[i] = '</ul>\n' + (line ? '<p style="margin: 0 0 8px 0;">' + line + '</p>' : '');
          inList = false;
        } else if (line) {
          if (line.startsWith("<h4") || line.startsWith("<h5") || line.startsWith("<table") || line.startsWith("<thead") || line.startsWith("<tbody") || line.startsWith("<tr") || line.startsWith("<th") || line.startsWith("<td") || line.startsWith("</table>") || line.startsWith("$$\n") || line.startsWith("$$") || line.startsWith("<div") || line.startsWith("</div") || line.startsWith("<hr")) {
            lines[i] = line;
          } else {
            lines[i] = '<p style="margin: 0 0 8px 0;">' + line + '</p>';
          }
        }
      }
    }
    if (inList) {
      lines.push('</ul>');
    }
    html = lines.join("\n");

    html = html.replace(/\$\$\n*([\s\S]*?)\n*\$\$/g, '<div style="background: rgba(255,255,255,0.02); border: 1px dashed var(--panel-border); padding: 8px; border-radius: 8px; font-family: monospace; text-align: center; margin: 8px 0; color: var(--secondary); font-size: 0.85rem;">$1</div>');
    html = html.replace(/`([^`\n]+)`/g, '<code style="font-family: monospace; background: rgba(255,255,255,0.04); padding: 1px 4px; border-radius: 4px; color: var(--secondary); font-size: 0.8rem;">$1</code>');
    html = html.replace(/^---$/gm, '<hr style="border: 0; border-top: 1px solid var(--panel-border); margin: 12px 0;">');

    return html;
  }

  function parseMarkdownTables(text) {
    const lines = text.split("\n");
    let inTable = false;
    let tableHtml = "";
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith("|") && line.endsWith("|")) {
        const cells = line.split("|").slice(1, -1).map(c => c.trim());
        if (!inTable) {
          inTable = true;
          tableHtml = '<table style="width:100%; border-collapse:collapse; margin:10px 0; font-size:0.75rem;">\n';
          tableHtml += '<thead>\n<tr>\n' + cells.map(c => `<th style="padding:6px; border:1px solid var(--panel-border); background:rgba(255,255,255,0.05); text-align:left; font-weight: 600;">${c}</th>`).join("\n") + '\n</tr>\n</thead>\n<tbody>\n';
          lines[i] = "";
        } else {
          if (cells.every(c => /^:-*:?$/.test(c) || c === "" || c.startsWith("-"))) {
            lines[i] = "";
          } else {
            tableHtml += '<tr>\n' + cells.map(c => `<td style="padding:6px; border:1px solid var(--panel-border); text-align:left;">${c}</td>`).join("\n") + '\n</tr>\n';
            lines[i] = "";
          }
        }
      } else {
        if (inTable) {
          tableHtml += '</tbody>\n</table>\n';
          lines[i] = tableHtml + "\n" + lines[i];
          inTable = false;
        }
      }
    }
    if (inTable) {
      tableHtml += '</tbody>\n</table>\n';
      lines.push(tableHtml);
    }
    return lines.filter(l => l !== "").join("\n");
  }

  function getPeriodDefaultDate(periodStr) {
    if (!periodStr) return new Date().toISOString().split("T")[0];
    const match = periodStr.match(/(\d+)\s+al\s+(\d+)\s+(\w+)\s+(\d{4})/i);
    if (match) {
      const dayStart = parseInt(match[1]);
      const monthStr = match[3].toLowerCase().substring(0, 3);
      const year = parseInt(match[4]);
      
      const months = {
        ene: 0, feb: 1, mar: 2, abr: 3, may: 4, jun: 5,
        jul: 6, ago: 7, sep: 8, oct: 9, nov: 10, dic: 11
      };
      const month = months[monthStr] !== undefined ? months[monthStr] : 3;
      
      // Default to start date of the period
      const d = new Date(year, month, dayStart);
      // Offset timezone to avoid UTC shifts
      const tzOffset = d.getTimezoneOffset() * 60000;
      return new Date(d.getTime() - tzOffset).toISOString().split("T")[0];
    }
    return new Date().toISOString().split("T")[0];
  }

  // Companies Catalog & Global AI Chat Logic
  function loadCompanies() {
    return fetch("/api/companies?_t=" + Date.now())
      .then(res => res.json())
      .then(companies => {
        state.companies = companies;
        populateCompanySelectors();
        renderCompaniesCatalog();
      })
      .catch(err => console.error("Error cargando catálogo de empresas:", err));
  }

  function populateCompanySelectors() {
    const colEmpresa = document.getElementById("col-empresa");
    const filterEmpresa = document.getElementById("filter-empresa");
    
    if (colEmpresa) {
      colEmpresa.innerHTML = state.companies.map(c => `
        <option value="${escapeHtml(c.nombre)}">${escapeHtml(c.nombre)}</option>
      `).join("");
    }
    
    if (filterEmpresa) {
      filterEmpresa.innerHTML = `
        <option value="">Todas las Empresas</option>
      ` + state.companies.map(c => `
        <option value="${escapeHtml(c.nombre)}">${escapeHtml(c.nombre)}</option>
      `).join("");
    }
  }

  function renderCompaniesCatalog() {
    const tableBody = document.getElementById("companies-list-table");
    if (!tableBody) return;
    
    const missingCos = state.config_status?.missing_companies_config || [];
    
    tableBody.innerHTML = state.companies.map(c => {
      const compName = c.nombre ? c.nombre.trim() : "";
      const isMissing = missingCos.includes(compName);
      const rowStyle = isMissing ? 'style="background: rgba(239, 68, 68, 0.08); border-left: 3px solid var(--error);"' : '';
      const textWarning = isMissing ? ' <span class="badge danger" style="padding: 2px 6px; font-size: 0.7rem; margin-left: 5px;">Falta Prima Riesgo</span>' : '';
      const primaStyle = isMissing ? 'style="color: var(--error); font-weight: bold;"' : '';
      
      return `
        <tr ${rowStyle}>
          <td style="font-weight: 600;">${escapeHtml(c.nombre)}${textWarning}</td>
          <td>${escapeHtml(c.regimen)}</td>
          <td ${primaStyle}>${(c.prima_riesgo || 0).toFixed(4)}%</td>
          <td>
            <button type="button" class="btn btn-secondary btn-sm" style="padding: 2px 8px; margin-right: 5px; display: inline-flex; align-items: center;" onclick="editCompany('${c.id}')">
              <i data-lucide="edit-3" style="width: 12px; height: 12px; margin-right: 2px;"></i> Editar
            </button>
            <button type="button" class="btn btn-danger btn-sm" style="padding: 2px 8px; background: var(--danger); border: none; display: inline-flex; align-items: center;" onclick="deleteCompany('${c.id}')">
              <i data-lucide="trash" style="width: 12px; height: 12px; margin-right: 2px;"></i> Eliminar
            </button>
          </td>
        </tr>
      `;
    }).join("");
    
    if (window.lucide) lucide.createIcons();
  }

  function editCompany(id) {
    const comp = state.companies.find(c => String(c.id) === String(id));
    if (!comp) return;
    
    document.getElementById("company-id").value = comp.id;
    document.getElementById("company-nombre").value = comp.nombre;
    document.getElementById("company-razon-social").value = comp.razon_social;
    document.getElementById("company-regimen").value = comp.regimen;
    document.getElementById("company-prima-riesgo").value = comp.prima_riesgo;
    
    document.getElementById("company-form-title").innerHTML = '<i data-lucide="edit"></i> Editar Empresa';
    document.getElementById("btn-cancel-company").style.display = "inline-block";
    
    if (window.lucide) lucide.createIcons();
  }

  function deleteCompany(id) {
    if (!confirm("¿Estás seguro de que deseas eliminar esta empresa del catálogo? Esto podría afectar a los colaboradores asignados a ella.")) return;
    
    fetch(`/api/companies?id=${id}`, {
      method: "DELETE"
    })
    .then(res => res.json())
    .then(data => {
      if (data.error) {
        showToast(data.error, "error");
      } else {
        showToast("Empresa eliminada del catálogo exitosamente", "success");
        loadState();
      }
    })
    .catch(err => {
      console.error(err);
      showToast("Error al eliminar empresa", "error");
    });
  }

  function openAIGlobalChat() {
    currentAIEmployeeId = "GLOBAL";
    aiChatHistory = [];
    
    const tbody = document.getElementById("prenomina-table-body");
    if (tbody) {
      tbody.querySelectorAll("tr").forEach(tr => tr.classList.remove("selected-row"));
    }
    
    const sidebar = document.getElementById("prenomina-ai-sidebar");
    const nameDiv = document.getElementById("ai-collab-name");
    const detailsDiv = document.getElementById("ai-collab-details");
    const messagesDiv = document.getElementById("ai-chat-messages");
    const chatInput = document.getElementById("ai-chat-input");
    const chatSendBtn = document.getElementById("btn-ai-chat-send");
    const badge = document.getElementById("ai-rules-badge");
    
    if (sidebar) sidebar.classList.add("active");
    if (nameDiv) nameDiv.textContent = "Consulta Global de Prenómina";
    if (detailsDiv) detailsDiv.textContent = "Haciendo preguntas a la IA sobre todos los colaboradores";
    
    if (messagesDiv) {
      messagesDiv.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 10px; padding: 2rem;">
          <div class="ai-typing-indicator">
            <div class="ai-typing-dot"></div>
            <div class="ai-typing-dot"></div>
            <div class="ai-typing-dot"></div>
          </div>
          <p style="font-size: 0.8rem; color: var(--text-muted); margin: 0;">Generando resumen de nómina global...</p>
        </div>
      `;
    }
    
    if (chatInput) {
      chatInput.disabled = true;
      chatInput.value = "";
    }
    if (chatSendBtn) chatSendBtn.disabled = true;
    
    fetch("/api/payroll/explain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employee_id: "GLOBAL",
        chat_history: [],
        new_message: ""
      })
    })
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          if (messagesDiv) {
            messagesDiv.innerHTML = `<div class="chat-message assistant" style="color: var(--danger);"><p>Error: ${escapeHtml(data.error)}</p></div>`;
          }
          return;
        }
        
        if (badge) {
          if (data.offline) {
            badge.textContent = "Offline / Local";
            badge.className = "badge rules-badge-offline";
          } else if (data.rules_source === "custom") {
            badge.textContent = "Reglas Empresa";
            badge.className = "badge rules-badge-custom";
          } else {
            badge.textContent = "Reglas Oficiales LFT";
            badge.className = "badge rules-badge-official";
          }
        }

        if (messagesDiv) {
          messagesDiv.innerHTML = "";
        }
        appendAssistantMessage(data.response);
        
        if (chatInput) chatInput.disabled = false;
        if (chatSendBtn) chatSendBtn.disabled = false;
        if (chatInput) chatInput.focus();
        
        if (window.lucide) lucide.createIcons();
      })
      .catch(err => {
        console.error("Error fetching global explanation:", err);
        if (messagesDiv) {
          messagesDiv.innerHTML = `<div class="chat-message assistant" style="color: var(--danger);"><p>Error de conexión al obtener la explicación global.</p></div>`;
        }
      });
  }

  function clearPrenominaFilter() {
    state.filterEmployeeIds = null;
    const filterBadge = document.getElementById("prenomina-filter-badge");
    if (filterBadge) {
      filterBadge.style.display = "none";
    }
    renderPrenomina();
  }

  // Setup company catalog form and cancel button listeners
  const companyForm = document.getElementById("form-company");
  if (companyForm) {
    companyForm.addEventListener("submit", (e) => {
      e.preventDefault();
      
      const id = document.getElementById("company-id").value;
      const nombre = document.getElementById("company-nombre").value.trim();
      const razon_social = document.getElementById("company-razon-social").value.trim();
      const regimen = document.getElementById("company-regimen").value;
      const prima_riesgo = parseFloat(document.getElementById("company-prima-riesgo").value);
      
      if (isNaN(prima_riesgo) || prima_riesgo < 0) {
        showToast("La prima de riesgo debe ser un número positivo.", "error");
        return;
      }
      
      const payload = { nombre, razon_social, regimen, prima_riesgo };
      if (id) payload.id = id;
      
      fetch("/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          showToast(data.error, "error");
        } else {
          showToast("Empresa guardada exitosamente", "success");
          companyForm.reset();
          document.getElementById("company-id").value = "";
          document.getElementById("company-form-title").innerHTML = '<i data-lucide="plus-circle"></i> Registrar / Editar Empresa';
          document.getElementById("btn-cancel-company").style.display = "none";
          loadState();
        }
      })
      .catch(err => {
        console.error(err);
        showToast("Error al guardar empresa", "error");
      });
    });
  }

  const cancelCompanyBtn = document.getElementById("btn-cancel-company");
  if (cancelCompanyBtn) {
    cancelCompanyBtn.addEventListener("click", () => {
      if (companyForm) companyForm.reset();
      document.getElementById("company-id").value = "";
      document.getElementById("company-form-title").innerHTML = '<i data-lucide="plus-circle"></i> Registrar / Editar Empresa';
      cancelCompanyBtn.style.display = "none";
      if (window.lucide) lucide.createIcons();
    });
  }

  // Hook global AI and clear filter buttons
  const btnOpenAiGlobal = document.getElementById("btn-open-ai-global");
  if (btnOpenAiGlobal) {
    btnOpenAiGlobal.addEventListener("click", openAIGlobalChat);
  }

  const btnClearFilter = document.getElementById("btn-clear-prenomina-filter");
  if (btnClearFilter) {
    btnClearFilter.addEventListener("click", clearPrenominaFilter);
  }

  const chkVerBajas = document.getElementById("chk-ver-bajas");
  if (chkVerBajas) {
    chkVerBajas.addEventListener("change", renderPrenomina);
  }

  // Expose local AI state variables and functions to window context
  Object.defineProperty(window, 'currentAIEmployeeId', {
    get: () => currentAIEmployeeId,
    set: (v) => { currentAIEmployeeId = v; }
  });
  Object.defineProperty(window, 'aiChatHistory', {
    get: () => aiChatHistory,
    set: (v) => { aiChatHistory = v; }
  });
  window.state = state;
  window.loadState = loadState;
  window.selectIncidenceEmployee = selectIncidenceEmployee;
  window.openAIGlobalChat = openAIGlobalChat;
  window.clearPrenominaFilter = clearPrenominaFilter;
  window.editCompany = editCompany;
  window.deleteCompany = deleteCompany;
  window.loadCompanies = loadCompanies;

  // Event delegation for cell tooltips on hover
  let tooltipTimeout = null;
  
  function showCellTooltip(cell, e) {
    let tooltip = document.getElementById("cell-tooltip");
    if (!tooltip) {
      tooltip = document.createElement("div");
      tooltip.id = "cell-tooltip";
      tooltip.className = "cell-tooltip";
      document.body.appendChild(tooltip);
    }

    const formula = cell.getAttribute("data-formula");
    const val = cell.textContent.trim();
    const fieldName = cell.getAttribute("data-field");
    
    if (val === '-' || val === '') {
      hideCellTooltip();
      return;
    }
    
    // Find label/header for the field if available
    let headerText = "";
    if (state.schema && state.schema.columns) {
      const col = state.schema.columns.find(c => c.field === fieldName);
      if (col) {
        headerText = col.label || col.header || "";
      }
    }
    
    let html = "";
    if (headerText) {
      html += `<div class="tooltip-header">${headerText}</div>`;
    }
    html += `<div class="tooltip-row"><strong>Valor:</strong> <span>${val}</span></div>`;
    if (formula) {
      html += `<div class="tooltip-row formula-row"><strong>Fórmula:</strong> <code>${formula}</code></div>`;
    }
    
    tooltip.innerHTML = html;
    tooltip.classList.add("active");
    
    // Position tooltip above the cell
    const rect = cell.getBoundingClientRect();
    const tooltipWidth = tooltip.offsetWidth;
    const tooltipHeight = tooltip.offsetHeight;
    
    const top = rect.top + window.scrollY - tooltipHeight - 8;
    const left = rect.left + window.scrollX + (rect.width - tooltipWidth) / 2;
    
    tooltip.style.top = `${top}px`;
    tooltip.style.left = `${left}px`;
  }
  
  function hideCellTooltip() {
    const tooltip = document.getElementById("cell-tooltip");
    if (tooltip) {
      tooltip.classList.remove("active");
    }
  }

  function clearHighlights() {
    document.querySelectorAll(".prenomina-table td.referenced-cell-highlight").forEach(c => {
      c.classList.remove("referenced-cell-highlight");
    });
  }

  function getColumnIndex(letter) {
    if (!state.schema || !state.schema.columns) return -1;
    const col = state.schema.columns.find(c => c.letter === letter);
    return col ? col.index : -1;
  }

  function getColumnRange(start, end) {
    const startIndex = getColumnIndex(start);
    const endIndex = getColumnIndex(end);
    if (startIndex === -1 || endIndex === -1 || !state.schema || !state.schema.columns) return [];
    
    const minIdx = Math.min(startIndex, endIndex);
    const maxIdx = Math.max(startIndex, endIndex);
    
    const result = [];
    state.schema.columns.forEach(c => {
      if (c.index >= minIdx && c.index <= maxIdx) {
        result.push(c.letter);
      }
    });
    return result;
  }

  function getReferencedColumnsForHover(formula, row) {
    if (!formula) return [];
    const referencedCols = new Set();
    
    // 1. Detect and parse ranges like P12:T12 (where row matches the employee's row number)
    const rangeRegex = new RegExp(`([A-Z]+)${row}:([A-Z]+)${row}`, 'g');
    let match;
    while ((match = rangeRegex.exec(formula)) !== null) {
      const colStart = match[1];
      const colEnd = match[2];
      const cols = getColumnRange(colStart, colEnd);
      cols.forEach(c => referencedCols.add(c));
    }
    
    // 2. Detect individual cells on the same row, e.g. AF12
    const cellRegex = new RegExp(`([A-Z]+)${row}\\b`, 'g');
    cellRegex.lastIndex = 0;
    while ((match = cellRegex.exec(formula)) !== null) {
      referencedCols.add(match[1]);
    }
    
    return Array.from(referencedCols);
  }

  document.addEventListener("mouseover", (e) => {
    const cell = e.target.closest(".prenomina-table tbody td");
    clearHighlights();
    
    if (!cell) {
      hideCellTooltip();
      if (tooltipTimeout) {
        clearTimeout(tooltipTimeout);
        tooltipTimeout = null;
      }
      return;
    }

    // Highlight source cells if hovering over a cell with a formula
    const formula = cell.getAttribute("data-formula");
    if (formula && state.schema && state.schema.columns) {
      const rowEl = cell.closest("tr");
      if (rowEl) {
        const idCell = rowEl.querySelector('td[data-field="id"]');
        const empId = idCell ? idCell.textContent.trim() : null;
        const emp = state.employees.find(emp => String(emp.id) === String(empId));
        if (emp && emp._row) {
          const letters = getReferencedColumnsForHover(formula, emp._row);
          const fieldsToHighlight = letters.map(l => {
            const col = state.schema.columns.find(c => c.letter === l);
            return col ? col.field : null;
          }).filter(Boolean);
          
          fieldsToHighlight.forEach(field => {
            const targetCell = rowEl.querySelector(`td[data-field="${field}"]`);
            if (targetCell) {
              targetCell.classList.add("referenced-cell-highlight");
            }
          });
        }
      }
    }
    
    if (tooltipTimeout) clearTimeout(tooltipTimeout);
    tooltipTimeout = setTimeout(() => {
      showCellTooltip(cell, e);
    }, 150); // slight delay for smooth browsing
  });
  
  document.addEventListener("mouseout", (e) => {
    const cell = e.target.closest(".prenomina-table tbody td");
    if (cell) {
      hideCellTooltip();
      if (tooltipTimeout) {
        clearTimeout(tooltipTimeout);
        tooltipTimeout = null;
      }
    }
    clearHighlights();
  });

  // Hide tooltip on scroll to prevent it from floating around detached
  // Hide tooltip on scroll to prevent it from floating around detached
  window.addEventListener("scroll", hideCellTooltip, { passive: true });

  // SCHEMA VALIDATION AND INTERACTIVE AUDITING WORKFLOW
  let activeSchemaPath = null;
  let activeColumnsData = [];

  function openSchemaValidationModal(excelPath) {
    activeSchemaPath = excelPath;
    const modal = document.getElementById("modal-schema-validation");
    if (!modal) return;
    
    modal.style.display = "flex";
    
    const columnsList = document.getElementById("schema-columns-list");
    const statusSummary = document.getElementById("schema-status-summary");
    
    columnsList.innerHTML = `
      <div style="text-align: center; padding: 3rem 0; width: 100%;">
        <div style="width: 40px; height: 40px; border: 4px solid rgba(255,255,255,0.1); border-top: 4px solid var(--primary); border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 15px auto;"></div>
        <p style="color: var(--text-muted); font-size: 0.9rem;">Auditoría contable y mapeo de columnas con Asistente IA...</p>
      </div>
    `;
    statusSummary.innerHTML = "";
    
    document.getElementById("schema-confirm-btn").disabled = true;
    
    fetch("/api/schema/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: excelPath })
    })
      .then(res => {
        if (!res.ok) {
          return res.json().then(errData => {
            throw new Error(errData.error || "Error de validación del archivo");
          });
        }
        return res.json();
      })
      .then(data => {
        activeColumnsData = data.columns;
        renderSchemaValidation(data);
      })
      .catch(err => {
        showToast(err.message, "error");
        
        const statusSummary = document.getElementById("schema-status-summary");
        const columnsList = document.getElementById("schema-columns-list");
        const confirmBtn = document.getElementById("schema-confirm-btn");
        
        if (statusSummary) {
          statusSummary.className = "alert-status danger";
          statusSummary.style.background = "rgba(239, 68, 68, 0.1)";
          statusSummary.style.border = "1px solid rgba(239, 68, 68, 0.2)";
          statusSummary.style.color = "#f87171";
          statusSummary.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-weight: 500;">Error de validación de estructura de base de datos</span>
            </div>
          `;
        }
        
        if (columnsList) {
          columnsList.innerHTML = `
            <div style="padding: 2.5rem; border-radius: 12px; background: rgba(239, 68, 68, 0.03); border: 1px dashed rgba(239, 68, 68, 0.15); color: #f87171; text-align: center; width: 100%; box-sizing: border-box;">
              <div style="width: 56px; height: 56px; border-radius: 50%; background: rgba(239, 68, 68, 0.1); display: flex; align-items: center; justify-content: center; margin: 0 auto 1.25rem auto;">
                <i data-lucide="alert-circle" style="width: 28px; height: 28px; color: #ef4444;"></i>
              </div>
              <h3 style="color: #f87171; margin-top: 0; margin-bottom: 0.5rem; font-size: 1.15rem; border: none; padding: 0; font-weight: 600;">No se pudo procesar el archivo Excel</h3>
              <p style="color: var(--text-muted); font-size: 0.88rem; max-width: 600px; margin: 0 auto 1.5rem auto; line-height: 1.55;">${err.message}</p>
              <div style="display: flex; justify-content: center; gap: 10px;">
                <button type="button" class="btn btn-secondary btn-sm" id="btn-close-validation-err" style="margin: 0; padding: 8px 16px;">Cerrar y Corregir</button>
              </div>
            </div>
          `;
          
          const closeErrBtn = document.getElementById("btn-close-validation-err");
          if (closeErrBtn) {
            closeErrBtn.addEventListener("click", () => {
              const modal = document.getElementById("modal-schema-validation");
              if (modal) modal.style.display = "none";
            });
          }
          
          if (window.lucide) lucide.createIcons();
        }
        
        if (confirmBtn) {
          confirmBtn.disabled = true;
        }
      });
  }

  function renderSchemaValidation(data) {
    const summary = data.summary;
    const columnsList = document.getElementById("schema-columns-list");
    const statusSummary = document.getElementById("schema-status-summary");
    const confirmBtn = document.getElementById("schema-confirm-btn");
    
    let alertClass = "success";
    let statusText = `Auditoría completada. Fórmulas Correctas: <strong>${summary.correct_count}</strong> | Sugeridas: <strong>${summary.recommended_count}</strong>`;
    
    if (summary.incorrect_count > 0) {
      alertClass = "danger";
      statusText = `¡Atención! Se detectaron <strong>${summary.incorrect_count}</strong> fórmulas incorrectas. Debes corregirlas antes de continuar.`;
    } else if (summary.recommended_count > 0) {
      alertClass = "warning";
      statusText = `Auditoría completada con <strong>${summary.recommended_count}</strong> fórmulas recomendadas por el Asistente.`;
    }
    
    statusSummary.className = `alert-status ${alertClass}`;
    
    if (alertClass === "danger") {
      statusSummary.style.background = "rgba(239, 68, 68, 0.1)";
      statusSummary.style.border = "1px solid rgba(239, 68, 68, 0.2)";
      statusSummary.style.color = "#f87171";
    } else if (alertClass === "warning") {
      statusSummary.style.background = "rgba(245, 158, 11, 0.1)";
      statusSummary.style.border = "1px solid rgba(245, 158, 11, 0.2)";
      statusSummary.style.color = "#fbbf24";
    } else {
      statusSummary.style.background = "rgba(16, 185, 129, 0.1)";
      statusSummary.style.border = "1px solid rgba(16, 185, 129, 0.2)";
      statusSummary.style.color = "#34d399";
    }
    
    statusSummary.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="font-weight: 500;">${statusText}</span>
      </div>
    `;
    
    columnsList.innerHTML = "";
    
    data.columns.forEach((col) => {
      const card = document.createElement("div");
      card.className = `schema-col-card ${col.status}`;
      card.dataset.index = col.index;
      
      const badgeText = {
        "correct": "Fórmula Correcta",
        "incorrect": "Fórmula Incorrecta",
        "recommended": "Fórmula Sugerida",
        "direct": "Entrada Directa"
      }[col.status];
      
      const categories = [
        { value: "metadata", label: "Metadatos / Info General" },
        { value: "nominal_imss", label: "Nominal IMSS (Base)" },
        { value: "others", label: "Otros Conceptos (Variables)" },
        { value: "deduction", label: "Deducciones / Incidencias" },
        { value: "calculated", label: "Cálculo con Fórmula" }
      ];
      
      let catOptionsHtml = categories.map(cat => 
        `<option value="${cat.value}" ${col.category === cat.value ? 'selected' : ''}>${cat.label}</option>`
      ).join("");

      let formulaBlock = "";
      if (col.status !== "direct") {
        formulaBlock = `
          <div class="form-group" style="margin-top: 10px; margin-bottom: 0;">
            <label style="font-size:0.75rem; color: var(--text-muted); font-weight:600;">Fórmula en Excel para Fila 6</label>
            <div class="schema-formula-input-group">
              <input type="text" class="formula-field" value="${col.formula || ''}" placeholder="Ej: =AB6/2" style="flex-grow:1; margin:0;" data-col-idx="${col.index}">
              ${col.status === "recommended" && col.recommended_formula ? `
                <button type="button" class="btn btn-secondary btn-sm btn-apply-suggested" style="margin:0; padding: 6px 12px; white-space:nowrap; border:1px solid var(--primary); color:var(--primary); background: rgba(59, 130, 246, 0.05);" data-col-idx="${col.index}">
                  Aplicar sugerencia
                </button>
              ` : ''}
              ${col.status === "incorrect" && col.recommended_formula ? `
                <button type="button" class="btn btn-secondary btn-sm btn-apply-suggested" style="margin:0; padding: 6px 12px; white-space:nowrap; border:1px solid var(--success); color:var(--success); background: rgba(16, 185, 129, 0.05);" data-col-idx="${col.index}">
                  Auto-corregir
                </button>
              ` : ''}
            </div>
          </div>
        `;
      }
      
      let explainBlock = "";
      if (col.reason) {
        explainBlock = `
          <div class="schema-explain-box ${col.status}">
            <strong>Análisis del Asistente:</strong> ${col.reason}
            ${col.recommended_formula ? `<br><strong style="margin-top: 4px; display:inline-block;">Fórmula propuesta:</strong> <code>${col.recommended_formula}</code>` : ''}
          </div>
        `;
      }
      
      card.innerHTML = `
        <div class="col-meta-panel" style="display:flex; flex-direction:column; gap:8px; border-right: 1px solid rgba(255,255,255,0.05); padding-right:1rem; min-height: 100%;">
          <div style="display:flex; align-items:center; justify-content:space-between; gap: 8px;">
            <span style="font-family:monospace; font-weight:700; font-size:1rem; color: var(--primary);">[Col. ${col.letter}] ${col.header}</span>
            <span class="badge ${col.status}" style="font-size:0.65rem; padding: 2px 6px;">${badgeText}</span>
          </div>
          
          <div class="form-group" style="margin-top:5px; margin-bottom: 0;">
            <label style="font-size:0.75rem; color: var(--text-muted);">Categoría en Sistema</label>
            <select class="category-select" data-col-idx="${col.index}" style="width:100%;">
              ${catOptionsHtml}
            </select>
          </div>
        </div>
        
        <div class="col-details-panel" style="display:flex; flex-direction:column; gap:8px; width: 100%;">
          <div class="form-grid" style="grid-template-columns: 1fr 1fr; gap:10px;">
            <div class="form-group" style="margin-bottom: 0;">
              <label style="font-size:0.75rem; color: var(--text-muted);">Etiqueta en Sistema</label>
              <input type="text" class="label-field" value="${col.label || ''}" style="margin:0;" data-col-idx="${col.index}">
            </div>
            <div class="form-group" style="margin-bottom: 0;">
              <label style="font-size:0.75rem; color: var(--text-muted);">Descripción / Función</label>
              <input type="text" class="desc-field" value="${col.description || ''}" style="margin:0;" data-col-idx="${col.index}">
            </div>
          </div>
          
          ${formulaBlock}
          ${explainBlock}
        </div>
      `;
      
      columnsList.appendChild(card);
    });
    
    // Bind click events on suggestions buttons
    columnsList.querySelectorAll(".btn-apply-suggested").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const colIdx = parseInt(btn.dataset.colIdx);
        const col = activeColumnsData.find(c => c.index === colIdx);
        if (col && col.recommended_formula) {
          const input = columnsList.querySelector(`input.formula-field[data-col-idx="${colIdx}"]`);
          if (input) {
            input.value = col.recommended_formula;
            col.formula = col.recommended_formula;
            col.status = "correct";
            col.reason = "Fórmula sugerida aplicada con éxito.";
            
            // Re-render validation locally
            renderSchemaValidation({ columns: activeColumnsData, summary: computeSummaryLocally(activeColumnsData) });
          }
        }
      });
    });
    
    // Update data structure on edits
    columnsList.querySelectorAll(".category-select").forEach(sel => {
      sel.addEventListener("change", (e) => {
        const colIdx = parseInt(sel.dataset.colIdx);
        const col = activeColumnsData.find(c => c.index === colIdx);
        if (col) {
          col.category = sel.value;
          if (col.category === "metadata" || col.category === "nominal_imss" || col.category === "others") {
            col.status = "direct";
            col.formula = null;
          } else if (col.status === "direct") {
            col.status = "recommended";
          }
          renderSchemaValidation({ columns: activeColumnsData, summary: computeSummaryLocally(activeColumnsData) });
        }
      });
    });
    
    columnsList.querySelectorAll(".label-field").forEach(inp => {
      inp.addEventListener("change", (e) => {
        const colIdx = parseInt(inp.dataset.colIdx);
        const col = activeColumnsData.find(c => c.index === colIdx);
        if (col) col.label = inp.value;
      });
    });
    
    columnsList.querySelectorAll(".desc-field").forEach(inp => {
      inp.addEventListener("change", (e) => {
        const colIdx = parseInt(inp.dataset.colIdx);
        const col = activeColumnsData.find(c => c.index === colIdx);
        if (col) col.description = inp.value;
      });
    });

    columnsList.querySelectorAll(".formula-field").forEach(inp => {
      inp.addEventListener("change", (e) => {
        const colIdx = parseInt(inp.dataset.colIdx);
        const col = activeColumnsData.find(c => c.index === colIdx);
        if (col) {
          col.formula = inp.value;
          if (!col.formula) {
            col.status = col.category === "calculated" ? "recommended" : "direct";
          }
        }
      });
    });
    
    if (window.lucide) lucide.createIcons();
    confirmBtn.disabled = summary.incorrect_count > 0;
  }

  function computeSummaryLocally(columns) {
    const correct_count = columns.filter(c => c.status === "correct").length;
    const incorrect_count = columns.filter(c => c.status === "incorrect").length;
    const recommended_count = columns.filter(c => c.status === "recommended").length;
    const direct_count = columns.filter(c => c.status === "direct").length;
    return {
      correct_count,
      incorrect_count,
      recommended_count,
      direct_count,
      has_minimal_fields: true
    };
  }

  const schemaCancelBtn = document.getElementById("schema-cancel-btn");
  const schemaRevalidateBtn = document.getElementById("schema-revalidate-btn");
  const schemaConfirmBtn = document.getElementById("schema-confirm-btn");
  const schemaModal = document.getElementById("modal-schema-validation");

  if (schemaCancelBtn) {
    schemaCancelBtn.addEventListener("click", () => {
      schemaModal.style.display = "none";
      showToast("Importación de base de datos cancelada.", "warning");
    });
  }

  if (schemaRevalidateBtn) {
    schemaRevalidateBtn.addEventListener("click", () => {
      if (!activeSchemaPath) return;
      showToast("Revalidando mapeo y fórmulas...", "info");
      
      const columnsList = document.getElementById("schema-columns-list");
      activeColumnsData.forEach(col => {
        const formulaInput = columnsList.querySelector(`input.formula-field[data-col-idx="${col.index}"]`);
        if (formulaInput) {
          col.formula = formulaInput.value.trim() || null;
        }
        const labelInput = columnsList.querySelector(`input.label-field[data-col-idx="${col.index}"]`);
        if (labelInput) {
          col.label = labelInput.value.trim() || col.header;
        }
        const descInput = columnsList.querySelector(`input.desc-field[data-col-idx="${col.index}"]`);
        if (descInput) {
          col.description = descInput.value.trim() || "";
        }
        const catSelect = columnsList.querySelector(`select.category-select[data-col-idx="${col.index}"]`);
        if (catSelect) {
          col.category = catSelect.value;
        }
      });
      
      columnsList.innerHTML = `
        <div style="text-align: center; padding: 3rem 0; width: 100%;">
          <div style="width: 40px; height: 40px; border: 4px solid rgba(255,255,255,0.1); border-top: 4px solid var(--primary); border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 15px auto;"></div>
          <p style="color: var(--text-muted); font-size: 0.9rem;">El Asistente está revalidando tus fórmulas...</p>
        </div>
      `;
      
      fetch("/api/schema/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: activeSchemaPath, columns: activeColumnsData })
      })
        .then(res => {
          if (!res.ok) {
            return res.json().then(errData => {
              throw new Error(errData.error || "Error de validación");
            });
          }
          return res.json();
        })
        .then(data => {
          activeColumnsData = data.columns;
          renderSchemaValidation(data);
          showToast("Fórmulas revalidadas con éxito.", "success");
        })
        .catch(err => {
          showToast(err.message, "error");
          // Re-render local in case server validate failed
          renderSchemaValidation({ columns: activeColumnsData, summary: computeSummaryLocally(activeColumnsData) });
        });
    });
  }

  if (schemaConfirmBtn) {
    schemaConfirmBtn.addEventListener("click", () => {
      if (!activeSchemaPath) return;
      
      // Update values from fields once more
      const columnsList = document.getElementById("schema-columns-list");
      activeColumnsData.forEach(col => {
        const formulaInput = columnsList.querySelector(`input.formula-field[data-col-idx="${col.index}"]`);
        if (formulaInput) {
          col.formula = formulaInput.value.trim() || null;
        }
        const labelInput = columnsList.querySelector(`input.label-field[data-col-idx="${col.index}"]`);
        if (labelInput) {
          col.label = labelInput.value.trim() || col.header;
        }
        const descInput = columnsList.querySelector(`input.desc-field[data-col-idx="${col.index}"]`);
        if (descInput) {
          col.description = descInput.value.trim() || "";
        }
        const catSelect = columnsList.querySelector(`select.category-select[data-col-idx="${col.index}"]`);
        if (catSelect) {
          col.category = catSelect.value;
        }
      });
      
      showToast("Escribiendo fórmulas contables en Excel...", "info");
      
      fetch("/api/schema/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: activeSchemaPath,
          columns: activeColumnsData
        })
      })
        .then(res => res.json())
        .then(confirmRes => {
          if (confirmRes.error) {
            showToast(confirmRes.error, "error");
            return;
          }
          
          // Now save config to link the database permanently
          const uma = parseFloat(document.getElementById("cfg-uma").value) || 117.31;
          const vales_pct = parseFloat(document.getElementById("cfg-vales-pct").value) || 40;
          const dias_mes = parseFloat(document.getElementById("cfg-dias-mes").value) || 30.4;
          const fa_pct = parseFloat(document.getElementById("cfg-fa-pct").value) || 11;
          const aguinaldo = parseFloat(document.getElementById("cfg-aguinaldo").value) || 15;
          const prima = parseFloat(document.getElementById("cfg-prima").value) || 25;
          
          const modelSelectVal = document.getElementById("cfg-ai-model-select") ? document.getElementById("cfg-ai-model-select").value : "gemini-2.5-flash";
          const ai_model = modelSelectVal === "custom" 
            ? (document.getElementById("cfg-ai-model-custom") ? document.getElementById("cfg-ai-model-custom").value.trim() : "gemini-2.5-flash")
            : modelSelectVal;
          const ai_provider = document.getElementById("cfg-ai-provider") ? document.getElementById("cfg-ai-provider").value : "google";

          fetch("/api/config", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              uma: uma,
              vales_pct: vales_pct,
              dias_mes: dias_mes,
              fa_pct: fa_pct,
              aguinaldo: aguinaldo,
              prima: prima,
              db_path: activeSchemaPath,
              ai_provider: ai_provider,
              ai_model: ai_model
            })
          })
            .then(res => res.json())
            .then(resData => {
              if (resData.error) {
                showToast(resData.error, "error");
                return;
              }
              
              showToast("Archivo '" + activeSchemaPath.split(/[/\\]/).pop() + "' conectado, recalculado y cargado con éxito.", "success");
              schemaModal.style.display = "none";
              loadState();
            })
            .catch(err => {
              console.error("Error saving path to config:", err);
              showToast("Error al vincular el archivo seleccionado.", "error");
            });
        })
        .catch(err => {
          showToast(err.message || "Error al confirmar esquema.", "error");
        });
    });
  }

});

window.applyAIProposedChanges = function(changes) {
  let bodyData;
  if (Array.isArray(changes)) {
    bodyData = changes.map(item => {
      const copy = { ...item };
      if (!copy.id && !copy.employee_id && window.currentAIEmployeeId && window.currentAIEmployeeId !== "GLOBAL") {
        copy.id = window.currentAIEmployeeId;
      }
      return copy;
    });
  } else {
    const copy = { ...changes };
    if (!copy.id && !copy.employee_id && window.currentAIEmployeeId && window.currentAIEmployeeId !== "GLOBAL") {
      copy.id = window.currentAIEmployeeId;
    }
    bodyData = [copy];
  }
  
  fetch("/api/incidences", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(bodyData)
  })
  .then(r => r.json())
  .then(res => {
    if (res.error) {
      if (typeof showToast === 'function') showToast(res.error, "error");
    } else {
      if (typeof showToast === 'function') showToast("Cambios aplicados exitosamente", "success");
      const messagesDiv = document.getElementById("ai-chat-messages");
      if (messagesDiv) {
         messagesDiv.innerHTML += `<div class="chat-message assistant" style="color: var(--success);"><p>¡Cambios aplicados en la nómina!</p></div>`;
         messagesDiv.scrollTop = messagesDiv.scrollHeight;
      }
      if (typeof window.state !== 'undefined' && typeof window.loadState === 'function') {
        if (window.currentAIEmployeeId && window.currentAIEmployeeId !== "GLOBAL") {
          window.state.selectedIncidenceEmployeeId = window.currentAIEmployeeId;
          window.loadState().then(() => {
            if (typeof window.selectIncidenceEmployee === 'function') {
              window.selectIncidenceEmployee(window.currentAIEmployeeId);
            }
          });
        } else {
          window.loadState();
        }
      }
    }
  })
  .catch(err => {
    console.error(err);
    if (typeof showToast === 'function') showToast("Error al aplicar", "error");
  });
};
