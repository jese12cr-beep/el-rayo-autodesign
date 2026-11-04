# El Rayo AutoDesign Studio ⚡
### Suite CAD Industrial para Personalización Automotriz, Hojalatería y Pintura

![License](https://img.shields.io/badge/License-Proprietary-gold.svg)
![Live App](https://img.shields.io/badge/Web%20Studio-Online%20en%20GitHub%20Pages-success.svg)
![Python](https://img.shields.io/badge/Python-3.12-blue.svg)
![UI](https://img.shields.io/badge/Design-Chevrolet%20Studio%20Dark-red.svg)

🌐 **Acceso Directo en Vivo (Sin Instalación ni Servidor Local)**:
👉 **[https://jese12cr-beep.github.io/el-rayo-autodesign/](https://jese12cr-beep.github.io/el-rayo-autodesign/)**

**El Rayo AutoDesign Studio** es una plataforma de grado industrial diseñada para talleres de hojalatería, centros de wrapping y talleres de personalización estética de vehículos. Combina una interfaz estilo **Photoshop CAD** con un motor de **fotogrametría 360°**, **segmentación semántica con IA (SAM)** y **colorimetría física basada en catálogos OEM**.

---

## 🎨 Características Principales

1. **Diseño de Interfaz Inspirado en Chevrolet.com**:
   - Paleta de estudio premium: Negro carbón (`#0B0D11`), grafito profundo (`#12151B`), acentos oro cálido/champaña Chevrolet (`#CD9E4A`) y rojo deportivo Corvette (`#D32323`).
   - Micro-interacciones con feedback táctil y visual de alta precisión.

2. **Herramientas de Edición Estilo Photoshop**:
   - **Varita Mágica IA (W)**: Detección por tolerancia en espacio de color CIE $\Delta E$ con detección de bordes Sobel.
   - **Bote de Pintura Rápido (G)** & **Pincel de Refinado (B)**.
   - **Cuentagotas (I)** & **Malla de Deformación 2.5D (M)** para vinilos, franjas y calcomanías.
   - **Comparador Antes / Después (X)** con divisor interactivo en tiempo real.

3. **Mapeo 3D y Fotogrametría Orbital 360°**:
   - Ingesta de mínimo 5 ángulos fotográficos reales del vehículo (Frontal $0^\circ$, Lateral Izquierda $90^\circ$, Trasera $180^\circ$, Lateral Derecha $270^\circ$, Perspectivas $3/4$).
   - Tornamesa interactiva con transición suave por ángulo y sincronización automática del repintado en todas las perspectivas.

4. **Segmentación Semántica Automática de Piezas (IA SAM)**:
   - Detección y aislamiento de paneles de carrocería: *Cofre, Toldo, Puertas delanteras y traseras, Fascias, Salpicaderas, Cajuela, Rines, Calipers y Vidrios*.
   - Modo dual de pintura: **Auto Completo (Carrocería Global)** o **Por Pieza Individual**.

5. **Simulador de Acabados Físicos (Shaders Realistas)**:
   - Conserva fielmente las luces especulares (*highlights*) y sombras naturales de la fotografía original.
   - Tipos de acabado:
     - **Esmalte Sólido (OEM Gloss)**
     - **Metálico (Flakes de Aluminio)**
     - **Perlado / Tricapa (Chroma Pearl e Iridiscencia)**
     - **Mate Satinado (Stealth Matte)**
   - Sliders de ajuste físico: Densidad de flakes, Brillo especular/Clearcoat y Rugosidad superficial (*roughness*).

6. **Catálogo Completo de Paletas OEM de Fabricantes**:
   - Fórmulas de color originales de: **Chevrolet, GMC, Cadillac, Buick, Ford, Dodge / SRT, Ram, Toyota, Lexus, Honda, Nissan, Mazda, BMW, Mercedes-AMG, Porsche, Ferrari, Lamborghini, Audi, Corvette Racing** y personalizaciones exclusivas de **El Rayo**.

---

## 🚀 Inicio Rápido (Servidor Local)

### Requisitos
- Python 3.10+ (compatible con Windows ARM64 Snapdragon y x86_64)
- Navegador moderno (Chrome, Edge o Firefox con soporte WebGL/ES Modules)

### Instalación de dependencias
```bash
pip install -r requirements.txt
```

### Ejecutar el Servidor Web CAD
```bash
python app/server.py
```
Abre tu navegador en:
```
http://localhost:8080
```

### Ejecutar como Aplicación de Escritorio (PyQt6)
```bash
python app/main.py
```

---

## 📂 Estructura del Proyecto

```
el_rayo_autodesign/
├── app/
│   ├── assets/                # Logos e imágenes de muestra de vehículos
│   │   ├── logo_el_rayo.png
│   │   └── sample_car_workshop.png
│   ├── paint_engine/          # Shaders y algoritmos físicos de fusión de pintura
│   │   ├── blender.py
│   │   └── finishes.py
│   ├── ui/                    # Ventana principal PyQt6 y componentes Glassmorphism
│   │   ├── main_window.py
│   │   └── components/
│   ├── vision/                # Preprocesamiento de imagen y segmentación SAM
│   │   ├── preprocessor.py
│   │   └── segmenter.py
│   ├── warp_engine/           # Motor de mallas de deformación 2.5D
│   │   └── mesh_warper.py
│   ├── web_canvas/            # Lienzo interactivo WebGL / HTML5 Canvas
│   │   ├── studio.html        # Interfaz de usuario Chevrolet Studio
│   │   └── js/
│   │       ├── palettes.js    # Catálogo de colores OEM de fabricantes
│   │       ├── image-ops.js   # Ciencia de color LAB, varita mágica y shaders
│   │       ├── project.js     # Modelo de datos y gestión de ángulos
│   │       └── orbit360.js    # Visor fotogramétrico 360°
│   ├── config.py
│   └── server.py              # Servidor HTTP local con APIs REST
├── requirements.txt
├── .gitignore
└── README.md
```

---

## 🛠️ Subir a tu Repositorio en GitHub

Para subir este proyecto a tu cuenta personal o de taller en GitHub:

1. **Crea un nuevo repositorio en GitHub** (ejemplo: `el-rayo-autodesign`).
2. **Ejecuta en tu terminal**:
```bash
cd C:\Users\crja_\.gemini\antigravity\scratch\el_rayo_autodesign
git remote add origin https://github.com/TU_USUARIO/el-rayo-autodesign.git
git branch -M main
git push -u origin main
```

---

**El Rayo Hojalatería y Pintura** — *Tecnología Automotriz de Precisión*.
