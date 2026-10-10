// Caixa slim para Waveshare 4" e-Paper HAT+ (E) - ecrã 600x400
// Duas peças: "bezel" (moldura frontal com janela) e "shell" (corpo traseiro).
// Ordem: bezel > acrílico/policarbonato 2 mm (colado com silicone) > painel > placa > corpo.
// Gerar STL:  openscad -D 'part="bezel"' -o bezel.stl eink_case.scad
//             openscad -D 'part="shell"' -o shell.stl eink_case.scad

part = "both";          // "bezel", "shell" ou "both" (pré-visualização)

// --- Dimensões (mm). Ajuste depois de medir o seu conjunto ---
FW = 124;  FH = 91;     // exterior (sem orelhas)
R = 6;                  // raio dos cantos
WALL = 4;               // parede do corpo
SHELL_D = 22;           // profundidade do corpo (piso + interior)
FLOOR = 3;              // espessura do piso
BEZEL_T = 4.2;          // espessura da moldura
LIP = 2.0;              // parte da moldura à frente do vidro
WIN_W = 90; WIN_H = 62; // janela (área ativa do ecrã: 84,6 x 56,4)
WIN_DX = 0; WIN_DY = 0; // deslocar a janela se a área ativa não estiver centrada no painel
PK_W = 107; PK_H = 74;  // alojamento do vidro (vidro de 106 x 73 x 2 mm)
SCREW = [57, 40.5];     // posição dos parafusos M3
CABLE_D = 14;           // furo para os fios (junto ao furo na porta)
CABLE_Y = -25;
GROOVE_IN = 1.0; GROOVE_OUT = 2.6; GROOVE_DEEP = 1.5;   // sulco para cordão de borracha de 1,5 mm

$fn = 48;

module outline(inset = 0) {
    offset(r = R - inset) square([FW - 2 * R, FH - 2 * R], center = true);
}
module corners() { for (sx = [-1, 1], sy = [-1, 1]) translate([sx * SCREW[0], sy * SCREW[1]]) children(); }

module bezel() {
    difference() {
        linear_extrude(BEZEL_T) outline();
        translate([WIN_DX - WIN_W / 2, WIN_DY - WIN_H / 2, -1]) cube([WIN_W, WIN_H, BEZEL_T + 2]);
        translate([-PK_W / 2, -PK_H / 2, LIP]) cube([PK_W, PK_H, BEZEL_T]);
        corners() {
            translate([0, 0, -1]) cylinder(d = 3.4, h = BEZEL_T + 2);
            translate([0, 0, -1]) cylinder(d = 6.2, h = 1 + 2.2);   // cabeça do parafuso
        }
    }
}

module ear(sx) {
    translate([sx * (FW / 2 + 8), 0, 0]) difference() {
        hull() { for (dy = [-8, 8]) translate([0, dy, 0]) cylinder(r = 8, h = 3); }
        hull() { for (dy = [-3, 3]) translate([0, dy, -1]) cylinder(d = 4.5, h = 5); }
    }
}

module shell() {
    difference() {
        union() {
            linear_extrude(SHELL_D) outline();
            ear(-1); ear(1);
        }
        // interior
        translate([0, 0, FLOOR]) linear_extrude(SHELL_D) outline(WALL);
        // sulco da junta
        translate([0, 0, SHELL_D - GROOVE_DEEP])
            linear_extrude(GROOVE_DEEP + 1) difference() { outline(GROOVE_IN); outline(GROOVE_OUT); }
        // furo dos fios
        translate([0, CABLE_Y, -1]) cylinder(d = CABLE_D, h = FLOOR + 2);
    }
    // pilares dos parafusos
    difference() {
        corners() cylinder(d = 9, h = SHELL_D);
        corners() translate([0, 0, SHELL_D - 14]) cylinder(d = 2.6, h = 15);
    }
}

// Montagem fechada (só para pré-visualização), com vidro e ecrã de exemplo
module assembled() {
    color("WhiteSmoke") shell();
    color("WhiteSmoke") translate([0, 0, SHELL_D + BEZEL_T]) mirror([0, 0, 1]) bezel();
    color("LightSkyBlue", 0.5) translate([-53, -36.5, SHELL_D + 0.0]) cube([106, 73, 2]);
    color("White") translate([-49.5 + 0, -33, SHELL_D - 1.2]) cube([99, 66, 1]);
    color("Black") translate([-42.3, -28.2, SHELL_D - 1.1]) cube([84.6, 56.4, 1.0]);
}

if (part == "bezel") bezel();
else if (part == "assembled") assembled();
else if (part == "shell") shell();
else {
    shell();
    translate([0, 0, SHELL_D + 10]) bezel();
}
