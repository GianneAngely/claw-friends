# Assemble kyoko_geo.npz in Blender: meshes, materials, armature + weights; export GLB and verification renders.
# usage: run.sh kyoko_blend.py -- <out.glb> <render_dir>
import bpy, json, math, sys, os
import numpy as np
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:]
OUT, RDIR = argv[0], argv[1]
B = "/Users/gianneangely/Documents/ClawFriends/blender"
data = np.load(f"{B}/kyoko_geo.npz")
parts = [json.loads(s) for s in data["parts"]]
bones = json.loads(str(data["bones"]))
meta = json.loads(str(data["meta"]))

for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
scene = bpy.context.scene; col = scene.collection

COLORS = {  # reference palette (sRGB); the game recolours by material name
    "Hood": (199, 199, 208), "HoodInner": (136, 136, 148), "EarInner": (224, 226, 232), "Nose": (56, 55, 59),
    "Skin": (248, 229, 214), "Face": (248, 229, 214), "Hair": (163, 40, 88), "HairTex": (163, 40, 88), "Top": (63, 69, 117),
    "Collar": (199, 199, 208), "Button": (197, 197, 204), "Shorts": (199, 198, 208), "Glove": (248, 229, 214),
}
MATS = {}
def mat(name):
    if name in MATS: return MATS[name]
    m = bpy.data.materials.new(name); m.use_nodes = True
    c = tuple((v / 255) ** 2.2 for v in COLORS[name]) + (1,)
    m.diffuse_color = c
    bsdf = m.node_tree.nodes["Principled BSDF"]; bsdf.inputs["Base Color"].default_value = c
    if name == "Face":
        img = bpy.data.images.load(f"{B}/kyoko_face.png")
        tex = m.node_tree.nodes.new("ShaderNodeTexImage"); tex.image = img
        m.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
        m.node_tree.links.new(tex.outputs["Alpha"], bsdf.inputs["Alpha"])
        m.blend_method = "BLEND" if hasattr(m, "blend_method") else None
    MATS[name] = m
    return m

objs = []
for p in parts:
    me = bpy.data.meshes.new(p["name"])
    me.from_pydata(p["verts"], [], p["faces"])
    me.validate()
    for poly in me.polygons: poly.use_smooth = True
    names = p["material"] if isinstance(p["material"], list) else [p["material"]]
    for n in names: me.materials.append(mat(n))
    if p["face_mat"]:
        fm = p["face_mat"]
        for poly in me.polygons: poly.material_index = fm[poly.index] if poly.index < len(fm) else 0
    if p["uv"]:
        uvl = me.uv_layers.new(name="UVMap")
        for loop in me.loops: uvl.data[loop.index].uv = p["uv"][loop.vertex_index]
    import bmesh
    bm = bmesh.new(); bm.from_mesh(me)
    if p["name"] == "Shell":
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(p["name"], me); col.objects.link(ob)
    objs.append((ob, p))

# armature
arm = bpy.data.armatures.new("KyokoRig"); rig = bpy.data.objects.new("KyokoRig", arm); col.objects.link(rig)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode="EDIT")
for name, parent, head, tail in bones:
    eb = arm.edit_bones.new(name); eb.head = Vector(head); eb.tail = Vector(tail)
    if parent: eb.parent = arm.edit_bones[parent]
bpy.ops.object.mode_set(mode="OBJECT")
bone_names = {b[0] for b in bones}
for ob, p in objs:
    wts = {k: np.asarray(v) for k, v in p["weights"].items() if k in bone_names}
    total = sum(wts.values()) + 1e-9
    for bname, w in wts.items():
        w = w / total
        vg = ob.vertex_groups.new(name=bname)
        for i in np.nonzero(w > 1e-3)[0]: vg.add([int(i)], float(w[i]), "REPLACE")
    ob.parent = rig
    mod = ob.modifiers.new("Armature", "ARMATURE"); mod.object = rig

# export
os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", export_yup=True, export_skins=True, export_animations=False)
print("EXPORTED", OUT, os.path.getsize(OUT))

# verification renders: front orthographic with the reference framing, flat colours
os.makedirs(RDIR, exist_ok=True)
K, FOOT = meta["K"], meta["FOOT"]
sc = scene
sc.render.engine = "BLENDER_WORKBENCH"
sc.view_settings.view_transform = "Standard"   # exact material colours in the checks
sc.display.shading.light = "FLAT"
sc.display.shading.color_type = "TEXTURE"
sc.display.shading.show_object_outline = True
sc.display.shading.object_outline_color = (0.12, 0.1, 0.12)
sc.display.render_aa = "OFF"
sc.render.film_transparent = False
sc.world = bpy.data.worlds.new("W") if not sc.world else sc.world
sc.display.shading.background_type = "VIEWPORT" if hasattr(sc.display.shading, "background_type") else None
cam_d = bpy.data.cameras.new("Cam"); cam_d.type = "ORTHO"; cam_d.ortho_scale = 781 * K
cam = bpy.data.objects.new("Cam", cam_d); col.objects.link(cam); sc.camera = cam
sc.render.resolution_x, sc.render.resolution_y = 584, 781
cz = (FOOT - 390.5) * K
def shot(name, az_deg, el_deg=0.0, flat=True, res=(584, 781), scale=781 * K):
    sc.display.shading.light = "FLAT" if flat else "STUDIO"
    sc.display.render_aa = "OFF" if flat else "8"
    sc.render.resolution_x, sc.render.resolution_y = res
    cam_d.ortho_scale = scale
    a, e = math.radians(az_deg), math.radians(el_deg)
    d = 12
    cam.location = Vector((d * math.sin(a) * math.cos(e), -d * math.cos(a) * math.cos(e), cz + d * math.sin(e)))
    cam.rotation_euler = (math.radians(90) - e, 0, a)
    sc.render.filepath = os.path.join(RDIR, name + ".png")
    bpy.ops.render.render(write_still=True)
shot("front_flat", 0)
for n, az in (("front", 0), ("three", 35), ("side", 90), ("back", 180)):
    shot(n, az, 6, flat=False, res=(700, 800), scale=4.0)
print("RENDERED", RDIR)
