# Kyoko's model pipeline

Kyoko is built from one front-view drawing, `refs/character/kyoko-base-flow.png`. Run the steps in order from this folder:

1. **`ref_measure.py`**: measures the drawing (head, hood opening, body, legs) into `kyoko_ref.json`.
2. **`ref_parts.py`**: cuts the drawing into part masks in `parts/` (hood, hair, braid, face, top, shorts, legs...). `parts_debug.png` shows them.
3. **`gen_geometry.py`**: turns the masks into meshes with numpy. It inflates the masks, builds ring volumes for the body and the hood shell, and paints the face and hair textures. Everything is written to `kyoko_geo.npz`, plus `kyoko_face.png` and `game/assets/kyoko_hair.png`.
4. **`./run.sh kyoko_blend.py -- ../game/assets/kyoko.glb <render_dir>`**: Blender adds the armature and skin weights, then exports the GLB the game loads.
5. **`face_expr.py`**: draws her six faces into `game/assets/kyoko_face_*.png` (`face_expr_sheet.png` is the overview).

`cmp_classes.py` compares a flat front render with the drawing, colour class by colour class, to catch shape drift. `run.sh` points at the Blender install it uses; change the path for another machine. `kid_model.py` is the first, fully procedural kid model and is no longer used by the game.
