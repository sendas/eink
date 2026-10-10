// Moldura SLIM (~10 mm): só o painel + adaptador da fita ficam no exterior.
// A placa HAT (com o Raspberry Pi) fica dentro de casa; a fita passa por uma fenda na porta.
// Peças: "bezel" (frente, com janela) e "back" (traseira, com cava para o adaptador e fenda da fita).
//   openscad -D 'part="bezel"' -o slim_bezel.stl eink_case_slim.scad
//   openscad -D 'part="back"'  -o slim_back.stl  eink_case_slim.scad
part = "both";

FW = 118; FH = 85; R = 5;       // exterior
WIN_W = 90; WIN_H = 62; WIN_DX = 0; WIN_DY = 0;   // janela (área ativa 84,6 x 56,4)
LIP = 1.6;                      // frente da moldura
GLASS_W = 103; GLASS_H = 70; GLASS_T = 1.5;       // vidro/acrílico 1,5 mm
PANEL_W = 100; PANEL_H = 67; PANEL_T = 1.3;       // alojamento do painel (99 x 66 x 0,85)
BEZEL_T = LIP + GLASS_T + PANEL_T;

BACK_T = 5.5;                   // traseira
AD_W = 34; AD_H = 20; AD_D = 4; // cava do adaptador da fita (confirme medindo o seu)
AD_X = 0; AD_Y = -29;           // posição junto à fita do painel (confirme no ecrã real)
SLOT_W = 18; SLOT_H = 2.4;      // fenda da fita

SCREW = [54.5, 38.5];           // parafusos 3 mm (também fixam à porta)

$fn = 48;
module outline() offset(r = R) square([FW - 2 * R, FH - 2 * R], center = true);
module corners() { for (sx = [-1, 1], sy = [-1, 1]) translate([sx * SCREW[0], sy * SCREW[1]]) children(); }

module bezel() {
    difference() {
        linear_extrude(BEZEL_T) outline();
        translate([WIN_DX - WIN_W / 2, WIN_DY - WIN_H / 2, -1]) cube([WIN_W, WIN_H, BEZEL_T + 2]);
        translate([-GLASS_W / 2, -GLASS_H / 2, LIP]) cube([GLASS_W, GLASS_H, GLASS_T + PANEL_T + 1]);
        translate([-PANEL_W / 2, -PANEL_H / 2, LIP + GLASS_T]) cube([PANEL_W, PANEL_H, PANEL_T + 1]);
        corners() {
            translate([0, 0, -1]) cylinder(d = 3.4, h = BEZEL_T + 2);
            translate([0, 0, -1]) cylinder(d = 6.2, h = 1 + 2.0);
        }
    }
}

module back() {
    difference() {
        linear_extrude(BACK_T) outline();
        translate([AD_X - AD_W / 2, AD_Y - AD_H / 2, BACK_T - AD_D]) cube([AD_W, AD_H, AD_D + 1]);
        translate([AD_X - SLOT_W / 2, AD_Y - SLOT_H / 2, -1]) cube([SLOT_W, SLOT_H, BACK_T + 2]);
        corners() translate([0, 0, -1]) cylinder(d = 3.4, h = BACK_T + 2);
    }
}

module assembled() {
    color("WhiteSmoke") back();
    color("WhiteSmoke") translate([0, 0, BACK_T + BEZEL_T]) mirror([0, 0, 1]) bezel();
}

if (part == "bezel") bezel();
else if (part == "back") back();
else assembled();
