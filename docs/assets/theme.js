/*!
 * MuffinEMU site — theme engine.
 *
 * Theme data is the app's own: 31 themes generated from
 * src/ios/App/MuffinThemePresets.swift (14 light/dark hex pairs each). Ids and
 * the storage key match the previous site, so a theme picked there carries over.
 *
 * The site itself is dark-first. A theme drives the site's colour channels
 * by the role each token plays in the app (see apply() below): glows from the
 * background, accents from pixelBlue/blushPink, buttons from the app's own
 * button gradient. The channels are registered with @property in site.css,
 * so a theme change cross-fades instead of snapping. The THEMES table is
 * generated from the app's MuffinThemePresets.swift by
 * tools/themes_from_swift.py.
 */
(function (global) {
  "use strict";

  var THEMES = [
    { id: "bakery", name: "Bakery (Original)", iconId: "original",
      top: ["#F4A551", "#935009"], bottom: ["#E6692D", "#512009"], muffinTop: ["#E3A254", "#C98A46"],
      muffinDark: ["#A8622A", "#8A4E20"], cream: ["#FDF6EC", "#241813"], wrapper: ["#F0DFC3", "#3A2A1E"],
      navy: ["#453765", "#8177AD"], pixel: ["#6C63FF", "#8A82FF"], blush: ["#F2A6A0", "#E08880"],
      brownDarkest: ["#2E1B10", "#FBEBD8"], brownDark: ["#5C2E10", "#E8CBA8"], brownMid: ["#7A4A22", "#C9A47C"],
      sparkle: ["#FFF3DD", "#FFF3DD"], shadow: ["#4A2410", "#000000"] },
    { id: "adhd-awareness", name: "ADHD Awareness", iconId: "adhd-awareness",
      top: ["#FC9F61", "#9A3F03"], bottom: ["#E66815", "#602B09"], muffinTop: ["#E46E1F", "#E46E1F"],
      muffinDark: ["#A04D16", "#C45F1B"], cream: ["#FEF6F0", "#2B1D14"], wrapper: ["#FEE8DA", "#432D1F"],
      navy: ["#A3301F", "#D67466"], pixel: ["#EFD639", "#F7EA97"], blush: ["#E79341", "#F3C79B"],
      brownDarkest: ["#23160E", "#FFF8F4"], brownDark: ["#4B301E", "#FEEFE5"], brownMid: ["#865636", "#FDE1CD"],
      sparkle: ["#FDF6F2", "#FDF6F2"], shadow: ["#3C2618", "#000000"] },
    { id: "audhd-awareness", name: "AuDHD Awareness", iconId: "audhd-awareness",
      top: ["#F7A617", "#754C04"], bottom: ["#B55A0E", "#4B2506"], muffinTop: ["#F8C868", "#F8C868"],
      muffinDark: ["#AE8C49", "#D5AC59"], cream: ["#FDF4E9", "#281B08"], wrapper: ["#FAE6CA", "#3E290D"],
      navy: ["#9D7425", "#D6B066"], pixel: ["#DA764E", "#EDB7A1"], blush: ["#D3D651", "#E7E9A5"],
      brownDarkest: ["#211505", "#FEF8F0"], brownDark: ["#472D0B", "#FCEDDA"], brownMid: ["#7F5113", "#F9DDB9"],
      sparkle: ["#FFFCF6", "#FFFCF6"], shadow: ["#382408", "#000000"] },
    { id: "autism-awareness", name: "Autism Muffin", iconId: "autism-awareness",
      top: ["#F47372", "#721B1B"], bottom: ["#FBF4E8", "#211B1C"], muffinTop: ["#4C58B4", "#4C58B4"],
      muffinDark: ["#861989", "#861989"], cream: ["#FFFCF7", "#262022"], wrapper: ["#EFE2CD", "#3D3336"],
      navy: ["#3F4FA3", "#9FAAE8"], pixel: ["#6C63FF", "#A19BFF"], blush: ["#D93A55", "#F28A9B"],
      brownDarkest: ["#2E1B10", "#FBF3E6"], brownDark: ["#5C2E10", "#EEDFC9"], brownMid: ["#7E6147", "#C9B39A"],
      sparkle: ["#FFFFFF", "#FFFFFF"], shadow: ["#3A2A20", "#000000"],
      stops: {
        light: ["#F47372", "#FBB874", "#F8F980", "#82C88F", "#A7D6EA", "#8D97CC", "#B36EB5", "#FBF4E8", "#FBF4E8"],
        dark: ["#721B1B", "#76481D", "#757225", "#27522F", "#405B69", "#2F3256", "#471847", "#211B1C", "#211B1C"],
        locations: [0.0, 0.015, 0.03, 0.045, 0.06, 0.075, 0.09, 0.15, 1.0]
      } },
    { id: "bisexual-pride", name: "Magenta Dusk", iconId: "bisexual-pride",
      top: ["#D60270", "#600132"], bottom: ["#00349B", "#001641"], muffinTop: ["#0038A8", "#0038A8"],
      muffinDark: ["#002776", "#003090"], cream: ["#FBE6F1", "#240314"], wrapper: ["#F5C2DD", "#38041F"],
      navy: ["#0A43B8", "#668BD6"], pixel: ["#DCC04B", "#EEDEA0"], blush: ["#D68B51", "#EAC2A4"],
      brownDarkest: ["#1E0010", "#FCEDF5"], brownDark: ["#400122", "#F8D4E7"], brownMid: ["#74013C", "#F2AED1"],
      sparkle: ["#F0F3FA", "#F0F3FA"], shadow: ["#33001B", "#000000"] },
    { id: "blueberry-blast", name: "Blueberry Blast", iconId: "blueberry-blast",
      top: ["#3E53DD", "#131F6C"], bottom: ["#2D409F", "#131B42"], muffinTop: ["#EACDA9", "#EACDA9"],
      muffinDark: ["#A49076", "#C9B091"], cream: ["#EEEFFA", "#101323"], wrapper: ["#D6D9F2", "#191D36"],
      navy: ["#9D6525", "#D6A266"], pixel: ["#27259F", "#6866D6"], blush: ["#5180D6", "#668DD6"],
      brownDarkest: ["#0C0E1C", "#F3F4FB"], brownDark: ["#191D3C", "#E2E4F6"], brownMid: ["#2D356C", "#C8CDED"],
      sparkle: ["#FEFCFA", "#FEFCFA"], shadow: ["#141830", "#000000"] },
    { id: "dark", name: "Dark Mode", iconId: "dark",
      top: ["#E1C7BF", "#7F4B3C"], bottom: ["#C1836B", "#583325"], muffinTop: ["#976842", "#976842"],
      muffinDark: ["#6A492E", "#825939"], cream: ["#FDFBF7", "#2A2621"], wrapper: ["#FBF5EC", "#423B33"],
      navy: ["#9D7625", "#D6B266"], pixel: ["#9D4A25", "#D68866"], blush: ["#9D252C", "#D6666D"],
      brownDarkest: ["#211E19", "#FEFCFA"], brownDark: ["#484035", "#FCF8F2"], brownMid: ["#817360", "#FAF2E6"],
      sparkle: ["#F9F6F4", "#F9F6F4"], shadow: ["#39332A", "#000000"] },
    { id: "disability-pride", name: "Disability Pride", iconId: "disability-pride",
      top: ["#B54B53", "#522225"], bottom: ["#5C5C5C", "#272727"], muffinTop: ["#5F373B", "#5F373B"],
      muffinDark: ["#422629", "#522F33"], cream: ["#F9F3EC", "#22180C"], wrapper: ["#F1E1D0", "#352513"],
      navy: ["#9D2532", "#D66672"], pixel: ["#D6C251", "#E7DEA6"], blush: ["#D69251", "#E7C6A6"],
      brownDarkest: ["#1B1208", "#FBF6F1"], brownDark: ["#3B2712", "#F5EADE"], brownMid: ["#6A4720", "#ECD7C1"],
      sparkle: ["#F5F3F3", "#F5F3F3"], shadow: ["#2F1F0E", "#000000"] },
    { id: "double-chocolate", name: "Double Chocolate", iconId: "double-chocolate",
      top: ["#7B5032", "#372417"], bottom: ["#5D371F", "#27170D"], muffinTop: ["#482D1B", "#482D1B"],
      muffinDark: ["#321F13", "#3E2717"], cream: ["#F2EEEB", "#150F0A"], wrapper: ["#DFD5CE", "#21170F"],
      navy: ["#9D3025", "#D67066"], pixel: ["#D68F51", "#DEAC82"], blush: ["#D6BF51", "#E5D89B"],
      brownDarkest: ["#110B07", "#F6F3F1"], brownDark: ["#25180F", "#E8E1DC"], brownMid: ["#422B1C", "#D4C7BE"],
      sparkle: ["#F4F2F1", "#F4F2F1"], shadow: ["#1D130C", "#000000"] },
    { id: "equality", name: "Equality", iconId: "equality",
      top: ["#3444EC", "#0B1577"], bottom: ["#2F35A1", "#141643"], muffinTop: ["#EDCFA5", "#EDCFA5"],
      muffinDark: ["#A69173", "#CCB28E"], cream: ["#ECEEFC", "#0E1026"], wrapper: ["#D2D5F7", "#16193B"],
      navy: ["#9D6B25", "#D6A766"], pixel: ["#33259D", "#7366D6"], blush: ["#4E6FD5", "#6682D6"],
      brownDarkest: ["#0A0B1F", "#F2F3FD"], brownDark: ["#141842", "#DFE1F9"], brownMid: ["#252C77", "#C3C7F4"],
      sparkle: ["#FEFCFA", "#FEFCFA"], shadow: ["#101335", "#000000"] },
    { id: "fix-the-world", name: "Fix the World", iconId: "fix-the-world",
      top: ["#FFCFAD", "#C05100"], bottom: ["#7748EC", "#2A0C74"], muffinTop: ["#FCA1C5", "#FCA1C5"],
      muffinDark: ["#B0718A", "#D98AA9"], cream: ["#FFFAF7", "#2D2520"], wrapper: ["#FFF2EB", "#463932"],
      navy: ["#A12655", "#D66792"], pixel: ["#9C51D6", "#C49BE4"], blush: ["#CD51D6", "#E3A6E7"],
      brownDarkest: ["#241C18", "#FFFBF9"], brownDark: ["#4D3C34", "#FFF6F1"], brownMid: ["#8A6D5D", "#FFEEE5"],
      sparkle: ["#FFF9FC", "#FFF9FC"], shadow: ["#3D302A", "#000000"] },
    { id: "galaxy-space", name: "Galaxy Space", iconId: "galaxy-space",
      top: ["#BAA7EA", "#422292"], bottom: ["#6748D9", "#251563"], muffinTop: ["#291659", "#291659"],
      muffinDark: ["#1D0F3E", "#23134D"], cream: ["#FDFAF6", "#29251F"], wrapper: ["#FAF3EA", "#403930"],
      navy: ["#44259D", "#8366D6"], pixel: ["#222FA0", "#6672D6"], blush: ["#70259D", "#AD66D6"],
      brownDarkest: ["#211D17", "#FEFCF9"], brownDark: ["#463E32", "#FBF6F0"], brownMid: ["#7E6F5A", "#F8EFE3"],
      sparkle: ["#F2F1F5", "#F2F1F5"], shadow: ["#383128", "#000000"] },
    { id: "happy", name: "Happy", iconId: "happy",
      top: ["#F796C7", "#A60D5A"], bottom: ["#832AF4", "#350671"], muffinTop: ["#CB92ED", "#CB92ED"],
      muffinDark: ["#8E66A6", "#AF7ECC"], cream: ["#FEF5FA", "#2B1D25"], wrapper: ["#FCE7F3", "#422D3A"],
      navy: ["#72259D", "#AE66D6"], pixel: ["#ED843B", "#F4BF9A"], blush: ["#E44B44", "#F1A19D"],
      brownDarkest: ["#22161D", "#FEF8FC"], brownDark: ["#492F3E", "#FDEEF7"], brownMid: ["#835470", "#FBDFF0"],
      sparkle: ["#FCF8FE", "#FCF8FE"], shadow: ["#3A2532", "#000000"] },
    { id: "holiday-frost", name: "Holiday Frost", iconId: "holiday-frost",
      top: ["#A6D4F0", "#1B6A9B"], bottom: ["#5B91C9", "#1E3D5C"], muffinTop: ["#7EACD8", "#7EACD8"],
      muffinDark: ["#587897", "#6C94BA"], cream: ["#F6FAFD", "#1F252A"], wrapper: ["#EBF4FA", "#313A41"],
      navy: ["#25649D", "#66A1D6"], pixel: ["#CF9131", "#D6AA66"], blush: ["#D67251", "#DB8F76"],
      brownDarkest: ["#181D21", "#F9FCFE"], brownDark: ["#333F47", "#F1F7FC"], brownMid: ["#5C717F", "#E4F0F9"],
      sparkle: ["#F7FAFD", "#F7FAFD"], shadow: ["#293239", "#000000"] },
    { id: "lemon-zest", name: "Lemon Zest", iconId: "lemon-zest",
      top: ["#FFE67C", "#AB8A00"], bottom: ["#FFBE12", "#725300"], muffinTop: ["#FDF2BE", "#FDF2BE"],
      muffinDark: ["#B1A985", "#DAD0A3"], cream: ["#FFFCF2", "#2C2818"], wrapper: ["#FFF9E0", "#453F25"],
      navy: ["#AD9428", "#D8C56E"], pixel: ["#51D6BA", "#71DDC6"], blush: ["#51C2D6", "#91D5E2"],
      brownDarkest: ["#242012", "#FFFDF6"], brownDark: ["#4C4526", "#FFFBE9"], brownMid: ["#897C44", "#FFF7D5"],
      sparkle: ["#FFFEFB", "#FFFEFB"], shadow: ["#3D371E", "#000000"] },
    { id: "lesbian-pride", name: "Sunset Coral", iconId: "lesbian-pride",
      top: ["#962E0F", "#441507"], bottom: ["#770047", "#32001E"], muffinTop: ["#F18B70", "#F18B70"],
      muffinDark: ["#A9614E", "#CF7860"], cream: ["#F5E6EF", "#1B0311"], wrapper: ["#E8C3D8", "#2A041A"],
      navy: ["#9D6025", "#D69E66"], pixel: ["#D53C25", "#E06E5C"], blush: ["#D65171", "#DC718A"],
      brownDarkest: ["#16010D", "#F8EEF4"], brownDark: ["#30021C", "#EFD5E4"], brownMid: ["#560333", "#E0AFCB"],
      sparkle: ["#FEF8F6", "#FEF8F6"], shadow: ["#260117", "#000000"] },
    { id: "mental-health-pride", name: "Mental Health Pride", iconId: "mental-health-pride",
      top: ["#4BA35C", "#224929"], bottom: ["#357649", "#16311E"], muffinTop: ["#7ABF8C", "#7ABF8C"],
      muffinDark: ["#558662", "#69A478"], cream: ["#F6F2EC", "#1E170D"], wrapper: ["#EBE0D2", "#2E2315"],
      navy: ["#259D54", "#66D692"], pixel: ["#7FD651", "#9BDB79"], blush: ["#51D655", "#95E397"],
      brownDarkest: ["#18120A", "#F9F6F2"], brownDark: ["#332614", "#F1E9DF"], brownMid: ["#5C4425", "#E4D6C3"],
      sparkle: ["#F7FBF8", "#F7FBF8"], shadow: ["#291E10", "#000000"] },
    { id: "mint-matcha", name: "Mint Matcha", iconId: "mint-matcha",
      top: ["#63D79A", "#1D7045"], bottom: ["#3BA775", "#194530"], muffinTop: ["#A8E4C6", "#A8E4C6"],
      muffinDark: ["#76A08B", "#90C4AA"], cream: ["#F1FAF5", "#15231C"], wrapper: ["#DDF2E6", "#21372B"],
      navy: ["#259D61", "#66D69E"], pixel: ["#B5D651", "#D7E7A6"], blush: ["#D6C751", "#E7E0A6"],
      brownDarkest: ["#101C15", "#F5FBF8"], brownDark: ["#223C2E", "#E7F6ED"], brownMid: ["#3D6D52", "#D2EEDE"],
      sparkle: ["#FAFDFC", "#FAFDFC"], shadow: ["#1B3024", "#000000"] },
    { id: "neon-cyber", name: "Neon Cyber", iconId: "neon-cyber",
      top: ["#11091E", "#07040D"], bottom: ["#0B0616", "#040209"], muffinTop: ["#233453", "#233453"],
      muffinDark: ["#18243A", "#1E2D47"], cream: ["#E6E7E8", "#020305"], wrapper: ["#C4C6C9", "#030508"],
      navy: ["#254D9D", "#668BD6"], pixel: ["#5C259D", "#9966D6"], blush: ["#30259D", "#7066D6"],
      brownDarkest: ["#010304", "#EEEEEF"], brownDark: ["#030509", "#D5D7D9"], brownMid: ["#050A10", "#B0B3B7"],
      sparkle: ["#F2F3F5", "#F2F3F5"], shadow: ["#020407", "#000000"] },
    { id: "nonbinary-pride", name: "Lemon & Lilac", iconId: "nonbinary-pride",
      top: ["#FCF434", "#878202"], bottom: ["#6E6E6E", "#2E2E2E"], muffinTop: ["#A56BCF", "#A56BCF"],
      muffinDark: ["#734B91", "#8E5CB2"], cream: ["#FFFEEB", "#2B2A0C"], wrapper: ["#FEFCCE", "#434112"],
      navy: ["#6B259D", "#A766D6"], pixel: ["#D9BC4F", "#EBDBA3"], blush: ["#D68951", "#E8C2A6"],
      brownDarkest: ["#232207", "#FFFEF1"], brownDark: ["#4C4910", "#FEFDDC"], brownMid: ["#88841C", "#FEFBBE"],
      sparkle: ["#FAF6FC", "#FAF6FC"], shadow: ["#3C3B0C", "#000000"] },
    { id: "pro-diamond-ice", name: "Diamond Ice", iconId: "pro-diamond-ice", pro: true,
      top: ["#DBEFFB", "#137CC0"], bottom: ["#6EB7E4", "#165277"], muffinTop: ["#9ACAE8", "#9ACAE8"],
      muffinDark: ["#6C8DA2", "#84AEC8"], cream: ["#FBFDFF", "#282B2D"], wrapper: ["#F6FBFE", "#3E4346"],
      navy: ["#256E9D", "#66AAD6"], pixel: ["#D65173", "#DD718D"], blush: ["#D651A4", "#E291C3"],
      brownDarkest: ["#1F2123", "#FCFEFF"], brownDark: ["#42474B", "#F9FCFE"], brownMid: ["#768188", "#F3FAFE"],
      sparkle: ["#F9FCFE", "#F9FCFE"], shadow: ["#35393C", "#000000"] },
    { id: "pro-gold-vip", name: "Gold VIP", iconId: "pro-gold-vip", pro: true,
      top: ["#F8C522", "#7B5F04"], bottom: ["#B47C17", "#4C3409"], muffinTop: ["#F7CD61", "#F7CD61"],
      muffinDark: ["#AD9044", "#D4B053"], cream: ["#FDF7EA", "#291F0A"], wrapper: ["#FAEDCD", "#3F3110"],
      navy: ["#999D25", "#D2D666"], pixel: ["#A94519", "#D68866"], blush: ["#D6A94F", "#D6B166"],
      brownDarkest: ["#211906", "#FEFAF0"], brownDark: ["#47350E", "#FCF2DB"], brownMid: ["#7F6019", "#F9E6BC"],
      sparkle: ["#FFFCF6", "#FFFCF6"], shadow: ["#392B0B", "#000000"] },
    { id: "pro-holographic", name: "Holographic", iconId: "pro-holographic", pro: true,
      top: ["#E3B3E8", "#842A8E"], bottom: ["#7047E1", "#29116B"], muffinTop: ["#ACEEE8", "#ACEEE8"],
      muffinDark: ["#78A7A2", "#94CDC8"], cream: ["#F6FCFE", "#1F272B"], wrapper: ["#EAF7FC", "#303D43"],
      navy: ["#25A093", "#66D6CB"], pixel: ["#BA51D6", "#DAA5E9"], blush: ["#8951D6", "#C2A6E7"],
      brownDarkest: ["#181F22", "#F9FDFE"], brownDark: ["#324249", "#F0F9FD"], brownMid: ["#5B7783", "#E3F4FB"],
      sparkle: ["#FAFEFE", "#FAFEFE"], shadow: ["#28353A", "#000000"] },
    { id: "progress-pride", name: "Progress Pride", iconId: "progress-pride",
      top: ["#C4BBC0", "#5C5156"], bottom: ["#9149CB", "#3D195A"], muffinTop: ["#DC7B66", "#DC7B66"],
      muffinDark: ["#9A5647", "#BD6A58"], cream: ["#FFFBF2", "#2C2619"], wrapper: ["#FFF5E1", "#453B26"],
      navy: ["#9D3A25", "#D67A66"], pixel: ["#6E51D6", "#8C77DB"], blush: ["#9F51D6", "#C193E2"],
      brownDarkest: ["#231E12", "#FFFCF6"], brownDark: ["#4C4027", "#FFF8EA"], brownMid: ["#897346", "#FEF2D7"],
      sparkle: ["#FDF7F6", "#FDF7F6"], shadow: ["#3D331F", "#000000"] },
    { id: "pumpkin-spice", name: "Pumpkin Spice", iconId: "pumpkin-spice",
      top: ["#E5B496", "#894921"], bottom: ["#D17440", "#5C2F16"], muffinTop: ["#C16D38", "#C16D38"],
      muffinDark: ["#874C27", "#A65E30"], cream: ["#FDF9F4", "#29221B"], wrapper: ["#F9F0E5", "#40352B"],
      navy: ["#9D7C25", "#D6B866"], pixel: ["#9D2525", "#D66667"], blush: ["#D37743", "#D68E66"],
      brownDarkest: ["#201B15", "#FDFBF7"], brownDark: ["#46392C", "#FBF4ED"], brownMid: ["#7D674F", "#F8EBDC"],
      sparkle: ["#FBF6F3", "#FBF6F3"], shadow: ["#382E23", "#000000"] },
    { id: "rainbow-pride", name: "Rainbow Pride", iconId: "rainbow-pride",
      top: ["#FF7D4B", "#952900"], bottom: ["#0700EF", "#030063"], muffinTop: ["#CBE36A", "#CBE36A"],
      muffinDark: ["#8E9F4A", "#AFC35B"], cream: ["#FFF9ED", "#2C230F"], wrapper: ["#FFF1D4", "#443618"],
      navy: ["#869D25", "#C1D666"], pixel: ["#50D86B", "#87E49A"], blush: ["#68D651", "#AFE7A4"],
      brownDarkest: ["#241B0B", "#FFFBF2"], brownDark: ["#4D3B17", "#FFF5E0"], brownMid: ["#8A6A28", "#FFECC5"],
      sparkle: ["#FCFDF6", "#FCFDF6"], shadow: ["#3D2F12", "#000000"] },
    { id: "retro", name: "Retro Console", iconId: "retro",
      top: ["#C0B0D6", "#533D72"], bottom: ["#7A55C4", "#311E57"], muffinTop: ["#422869", "#422869"],
      muffinDark: ["#2E1C4A", "#39225A"], cream: ["#FCF9F6", "#28241E"], wrapper: ["#F8F2E9", "#3E382F"],
      navy: ["#54259D", "#9266D6"], pixel: ["#AF3F29", "#D67966"], blush: ["#D69851", "#D6A266"],
      brownDarkest: ["#201C17", "#FDFBF9"], brownDark: ["#443C31", "#FAF5EF"], brownMid: ["#7B6B58", "#F6EDE2"],
      sparkle: ["#F4F2F6", "#F4F2F6"], shadow: ["#363027", "#000000"] },
    { id: "spooky-halloween", name: "Spooky Halloween", iconId: "spooky-halloween",
      top: ["#643286", "#2D173C"], bottom: ["#461F65", "#1E0D2B"], muffinTop: ["#351C47", "#351C47"],
      muffinDark: ["#251432", "#2E183D"], cream: ["#F2EDEB", "#170F0B"], wrapper: ["#E1D5CF", "#231711"],
      navy: ["#6A259D", "#A766D6"], pixel: ["#D68751", "#E7BEA3"], blush: ["#D65651", "#E7A9A6"],
      brownDarkest: ["#120B08", "#F6F3F1"], brownDark: ["#271811", "#EAE1DD"], brownMid: ["#462B1E", "#D7C7BF"],
      sparkle: ["#F3F1F4", "#F3F1F4"], shadow: ["#1F130D", "#000000"] },
    { id: "strawberry", name: "Strawberry", iconId: "strawberry",
      top: ["#FFBFD1", "#C90037"], bottom: ["#FF4276", "#860025"], muffinTop: ["#F8E7DB", "#F8E7DB"],
      muffinDark: ["#AEA299", "#D5C7BC"], cream: ["#FFF9FA", "#2D2326"], wrapper: ["#FFF0F4", "#46373B"],
      navy: ["#B6602B", "#DA9B74"], pixel: ["#7AD651", "#92DD71"], blush: ["#51D65A", "#91E296"],
      brownDarkest: ["#241B1D", "#FFFBFC"], brownDark: ["#4D393F", "#FFF4F7"], brownMid: ["#8A6771", "#FFEBF0"],
      sparkle: ["#FFFEFD", "#FFFEFD"], shadow: ["#3D2E32", "#000000"] },
    { id: "summer-beach", name: "Summer Beach", iconId: "summer-beach",
      top: ["#29ABAA", "#124D4C"], bottom: ["#1B6F7E", "#0B2F35"], muffinTop: ["#4DBDC6", "#4DBDC6"],
      muffinDark: ["#36848B", "#42A3AA"], cream: ["#EAF5F7", "#091A1D"], wrapper: ["#CCE6EB", "#0E292E"],
      navy: ["#25949D", "#66CED6"], pixel: ["#C8662F", "#D68E66"], blush: ["#D6B251", "#D9BD72"],
      brownDarkest: ["#061518", "#F0F8F9"], brownDark: ["#0C2E33", "#DBEDF1"], brownMid: ["#16525C", "#BBDEE4"],
      sparkle: ["#F4FBFC", "#F4FBFC"], shadow: ["#0A2429", "#000000"] },
    { id: "transgender-pride", name: "Sky & Blush", iconId: "transgender-pride",
      top: ["#5BCEFA", "#056D94"], bottom: ["#07AEEE", "#034964"], muffinTop: ["#F3A9B8", "#F3A9B8"],
      muffinDark: ["#AA7681", "#D1919E"], cream: ["#EFFAFE", "#12242B"], wrapper: ["#D8F3FE", "#1C3943"],
      navy: ["#A0263D", "#D6667B"], pixel: ["#51A3D6", "#A6CEE7"], blush: ["#5173D6", "#A6B7E7"],
      brownDarkest: ["#0D1D23", "#F4FCFF"], brownDark: ["#1B3E4B", "#E3F7FE"], brownMid: ["#316F87", "#CBEFFD"],
      sparkle: ["#FEFAFB", "#FEFAFB"], shadow: ["#16313C", "#000000"] }
  ];

  var STORE_KEY = "muffinemu.site.themeId";
  var MODE_KEY = "muffinemu.site.mode";
  var root = document.documentElement;
  var listeners = [];

  function store(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function load(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }

  function findIndexById(id) {
    for (var i = 0; i < THEMES.length; i++) if (THEMES[i].id === id) return i;
    return -1;
  }

  // The rainbow bands of a multi-stop theme (Autism Muffin), without the page tail.
  function bandsOf(t, light) {
    var stops = light ? t.stops.light : t.stops.dark, locs = t.stops.locations, out = [];
    for (var i = 0; i < stops.length; i++) if (locs[i] < 0.1) out.push(stops[i]);
    return out;
  }


  /* The app's own background, exactly as MuffinTheme.backgroundGradient draws it:
     multi-stop themes top-to-bottom at their stop locations, the rest a
     top-leading to bottom-trailing diagonal. */
  function backgroundOf(t, light) {
    var k = light ? 0 : 1;
    if (t.stops) {
      var s = light ? t.stops.light : t.stops.dark, l = t.stops.locations;
      return "linear-gradient(180deg, " + s.map(function (c, i) { return c + " " + (l[i] * 100).toFixed(1) + "%"; }).join(", ") + ")";
    }
    return "linear-gradient(135deg, " + t.top[k] + ", " + t.bottom[k] + ")";
  }

  /* ---------------------------------------------------------------
     Colour maths. Themes keep the app's hues; only lightness (and, for
     colours that have a hue, a minimum chroma) is adjusted, in OKLCH, until a
     colour measurably works on the site's own backgrounds in the current
     mode. Nothing is left to luck: every text colour is checked against the
     page and card backgrounds it can sit on.
     --------------------------------------------------------------- */
  function hexToRgb(h) { return [1, 3, 5].map(function (i) { return parseInt(h.substr(i, 2), 16) / 255; }); }
  function toLin(v) { return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
  function fromLin(v) { return v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055; }
  function hex2(v) { var n = Math.round(Math.min(1, Math.max(0, v)) * 255); return (n < 16 ? "0" : "") + n.toString(16); }

  function toOklch(hex) {
    var c = hexToRgb(hex).map(toLin);
    var l = Math.cbrt(0.4122214708 * c[0] + 0.5363325363 * c[1] + 0.0514459929 * c[2]);
    var m = Math.cbrt(0.2119034982 * c[0] + 0.6806995451 * c[1] + 0.1073969566 * c[2]);
    var s = Math.cbrt(0.0883024619 * c[0] + 0.2817188376 * c[1] + 0.6299787005 * c[2]);
    var L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
    var A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
    var B = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
    return [L, Math.sqrt(A * A + B * B), Math.atan2(B, A)];
  }
  function oklchToLinRgb(L, C, H) {
    var A = C * Math.cos(H), B = C * Math.sin(H);
    var l = Math.pow(L + 0.3963377774 * A + 0.2158037573 * B, 3);
    var m = Math.pow(L - 0.1055613458 * A - 0.0638541728 * B, 3);
    var s = Math.pow(L - 0.0894841775 * A - 1.2914855480 * B, 3);
    return [
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
    ];
  }
  // Back to sRGB, reducing chroma (never lightness or hue) until it fits the gamut.
  function fromOklch(L, C, H) {
    var lo = 0, hi = C, rgb = oklchToLinRgb(L, C, H);
    function inGamut(v) { return v.every(function (x) { return x >= -0.0005 && x <= 1.0005; }); }
    if (!inGamut(rgb)) {
      for (var i = 0; i < 24; i++) {
        var mid = (lo + hi) / 2, t = oklchToLinRgb(L, mid, H);
        if (inGamut(t)) { lo = mid; rgb = t; } else hi = mid;
      }
      rgb = oklchToLinRgb(L, lo, H);
    }
    return "#" + rgb.map(function (v) { return hex2(fromLin(Math.min(1, Math.max(0, v)))); }).join("");
  }

  function luminance(hex) {
    var c = hexToRgb(hex).map(toLin);
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function contrast(a, b) {
    var x = luminance(a), y = luminance(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  }
  function mixHex(a, b, t) {
    var x = hexToRgb(a), y = hexToRgb(b);
    return "#" + x.map(function (v, i) { return hex2(v + (y[i] - v) * t); }).join("");
  }

  // The backgrounds the site draws (site.css): page, and the lightest/darkest
  // card surface over it.
  var GROUNDS = { dark: ["#05060B", "#13141B"], light: ["#F4F5FA", "#FFFFFF"] };

  /* Clamp a colour's lightness into [lo, hi] and give it at least `minC`
     chroma if it has a hue at all (greys stay grey). For glows and dots. */
  function fit(hex, lo, hi, minC) {
    var o = toOklch(hex), C = o[1] >= 0.02 ? Math.max(o[1], minC) : o[1];
    return fromOklch(Math.min(hi, Math.max(lo, o[0])), C, o[2]);
  }

  /* The nearest colour with the same hue that reaches `target` contrast on
     every ground (lighter on dark grounds, darker on light ones). */
  function readable(hex, grounds, target, minC) {
    var o = toOklch(hex), dark = luminance(grounds[0]) < 0.2;
    var C = o[1] >= 0.02 ? Math.max(o[1], minC || 0) : o[1], L = o[0];
    function ok(h) { return grounds.every(function (g) { return contrast(h, g) >= target; }); }
    var out = fromOklch(L, C, o[2]);
    for (var i = 0; i < 100 && !ok(out); i++) {
      L = dark ? Math.min(1, L + 0.01) : Math.max(0, L - 0.01);
      out = fromOklch(L, C, o[2]);
    }
    return out;
  }

  /* Button label. The app puts sparkleCream on its button gradient, but on
     most themes that reads below 4.5:1. The label must reach 4.5:1 across
     the middle 60% of the gradient (where it sits) and 3:1 at both ends;
     sparkleCream is kept wherever it does, then the app's own text colour
     (brownDarkest), then white or near-black, else whichever reads best. */
  function buttonText(t, k) {
    var a = t.muffinTop[k], b = t.muffinDark[k];
    var samples = [0.2, 0.35, 0.5, 0.65, 0.8].map(function (x) { return mixHex(a, b, x); });
    function inner(c) { return Math.min.apply(null, samples.map(function (s) { return contrast(c, s); })); }
    function ends(c) { return Math.min(contrast(c, a), contrast(c, b)); }
    function ok(c) { return inner(c) >= 4.5 && ends(c) >= 3; }
    function score(c) { return Math.min(inner(c), ends(c) * 1.5); }
    var picks = [t.sparkle[k], t.brownDarkest[0], "#FFFFFF", "#0B0B12"];
    for (var i = 0; i < picks.length; i++) if (ok(picks[i])) return picks[i];
    return picks.reduce(function (x, y) { return score(y) > score(x) ? y : x; });
  }

  /* The app's button gradient with a label that reads. When no label colour
     can reach 4.5:1 across the gradient (a light-to-dark gradient can defeat
     every choice), the gradient ends are moved away from the label in
     lightness only, a step at a time, until it does. Hue is untouched. */
  function buttonColours(t, k) {
    var a = t.muffinTop[k], b = t.muffinDark[k], label = buttonText(t, k);
    var darkLabel = luminance(label) < 0.18;
    function inner(x, y) {
      return Math.min.apply(null, [0.2, 0.35, 0.5, 0.65, 0.8].map(function (f) { return contrast(label, mixHex(x, y, f)); }));
    }
    function good(x, y) { return inner(x, y) >= 4.5 && Math.min(contrast(label, x), contrast(label, y)) >= 3; }
    function step(hex) {
      var o = toOklch(hex);
      return fromOklch(Math.min(1, Math.max(0, o[0] + (darkLabel ? 0.01 : -0.01))), o[1], o[2]);
    }
    for (var i = 0; i < 60 && !good(a, b); i++) {
      if (contrast(label, a) <= contrast(label, b)) a = step(a); else b = step(b);
    }
    return { b1: a, b2: b, onB: label };
  }

  /* Everything the site derives from a theme, for one mode. Sources follow
     the role each token plays in the app (MuffinTheme.swift):
       glows a1..a4   backgroundTop, pixelBlue, blushPink, backgroundBottom
                      (Autism Muffin: its first/last rainbow bands for a1/a4)
       s1..s5         gradient text and bars: backgroundTop, blushPink,
                      pixelBlue, blueberryNavy, backgroundBottom (Autism
                      Muffin: five of its rainbow bands)
       accent         pixelBlue, the app's interactive tint (links, focus)
       accent2        backgroundTop (eyebrows), or pixelBlue for a grey top
       b1, b2, on-b   the app's button gradient and its label (buttonText)
     Glows are clamped into a visible lightness band; text colours are
     pushed until they read (4.5:1 body text, 3:1 large gradient text). */
  function derive(t, light) {
    var k = light ? 0 : 1, g = light ? GROUNDS.light : GROUNDS.dark;
    var glo = light ? [0.45, 0.78] : [0.62, 0.85];
    var bands = t.stops ? bandsOf(t, true) : null;
    var src = {
      a1: bands ? bands[0] : t.top[0], a2: t.pixel[k], a3: t.blush[k],
      a4: bands ? bands[bands.length - 1] : t.bottom[0]
    };
    var specSrc = bands ? [bands[0], bands[1], bands[3], bands[4], bands[6]]
                        : [t.top[0], t.blush[0], t.pixel[k], t.navy[k], t.bottom[0]];
    var top = bands ? bands[0] : t.top[k];
    var out = buttonColours(t, k);
    ["a1", "a2", "a3", "a4"].forEach(function (n) { out[n] = fit(src[n], glo[0], glo[1], 0.12); });
    out.s = specSrc.map(function (c) { return readable(c, g, 3.2, 0.1); });
    // Small marks (dots, bars, ring beads) are non-text: 3:1 against the page.
    out.dots = [src.a1, src.a2, src.a3].map(function (c) { return readable(fit(c, 0, 1, 0.12), g, 3); });
    out.accent = readable(t.pixel[k], g, 4.6);
    out.accent2 = readable(toOklch(top)[1] >= 0.03 ? top : t.pixel[k], g, 4.6, 0.06);
    return out;
  }

  function spectrumOf(t) {
    var d = derive(t, isLight());
    return "linear-gradient(100deg, " + d.s.join(", ") + ")";
  }

  var current = 0;

  function apply(i) {
    var t = THEMES[i], light = isLight(), d = derive(t, light);
    current = i;
    var set = function (n, v) { root.style.setProperty(n, v); };
    set("--a1", d.a1); set("--a2", d.a2); set("--a3", d.a3); set("--a4", d.a4);
    d.s.forEach(function (c, j) { set("--s" + (j + 1), c); });
    d.dots.forEach(function (c, j) { set("--dot" + (j + 1), c); });
    set("--accent-text", d.accent); set("--accent-text-2", d.accent2);
    set("--b1", d.b1); set("--b2", d.b2); set("--on-b", d.onB);
    root.setAttribute("data-theme", t.id);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", light ? GROUNDS.light[0] : GROUNDS.dark[0]);
    listeners.forEach(function (fn) { fn(t, i); });
  }

  function setByIndex(i, persist) {
    i = (i + THEMES.length) % THEMES.length;
    apply(i);
    if (persist) store(STORE_KEY, THEMES[i].id);
  }

  function setById(id, persist) {
    var i = findIndexById(id);
    if (i >= 0) setByIndex(i, persist);
  }

  /* Mode: "auto" follows the system, otherwise forced. */
  var MODES = ["auto", "dark", "light"];
  function setMode(m, persist) {
    if (MODES.indexOf(m) < 0) m = "auto";
    if (m === "auto") root.removeAttribute("data-mode");
    else root.setAttribute("data-mode", m);
    root.setAttribute("data-mode-pref", m);
    if (persist) store(MODE_KEY, m);
    if (ready) apply(current);
  }
  function getMode() { return root.getAttribute("data-mode-pref") || "auto"; }
  function isLight() {
    var m = getMode();
    if (m !== "auto") return m === "light";
    return !!(global.matchMedia && global.matchMedia("(prefers-color-scheme: light)").matches);
  }

  // Folder this script lives in (assets/), for icon URLs before <body> exists.
  var assetsBase = (document.currentScript && document.currentScript.src || "").replace(/[^/]*$/, "");
  // Remastered icons (tools/remaster_icons.py): the dark appearance in dark mode.
  function iconUrl(t, variant) {
    var v = variant != null ? variant : (isLight() ? "" : "-dark");
    return assetsBase + "icons/" + t.id + v + ".svg";
  }

  /* Point every img[data-theme-icon] parsed so far at the current theme's
     icon. Called inline right after the hero icon, so the first paint already
     shows the right icon (no swap animation on load). */
  function paintIcons() {
    var imgs = document.querySelectorAll("img[data-theme-icon]");
    for (var i = 0; i < imgs.length; i++) {
      if (imgs[i].getAttribute("data-painted") === "1") continue;
      imgs[i].src = iconUrl(THEMES[current]);
      imgs[i].setAttribute("data-painted", "1");
    }
  }

  // Lets CSS hide below-the-fold reveals only when the script that shows them will run.
  root.classList.remove("no-js");
  root.classList.add("js");

  // Colour transitions are for theme switches, not page loads: hold them off
  // until the first frames have painted.
  root.classList.add("booting");
  var unboot = function () { root.classList.remove("booting"); };
  if (global.requestAnimationFrame) global.requestAnimationFrame(function () { global.requestAnimationFrame(unboot); });
  else unboot();

  // Apply immediately (this script is loaded in <head>) so there is no flash.
  // Mode first: the theme's light/dark values depend on it.
  var ready = false;
  setMode(load(MODE_KEY) || "auto", false);
  var saved = load(STORE_KEY);
  setByIndex(saved && findIndexById(saved) >= 0 ? findIndexById(saved) : 0, false);
  ready = true;
  // Fetch the saved theme's icon now, in parallel with the CSS and fonts.
  if (assetsBase && document.head) {
    var pre = document.createElement("link");
    pre.rel = "preload"; pre.as = "image"; pre.href = iconUrl(THEMES[current]);
    document.head.appendChild(pre);
  }
  if (global.matchMedia) {
    var mq = global.matchMedia("(prefers-color-scheme: light)");
    var onSys = function () { if (getMode() === "auto") apply(current); };
    if (mq.addEventListener) mq.addEventListener("change", onSys); else if (mq.addListener) mq.addListener(onSys);
  }

  global.MuffinThemes = {
    THEMES: THEMES,
    STORE_KEY: STORE_KEY,
    setById: setById,
    setByIndex: setByIndex,
    current: function () { return current; },
    spectrumOf: spectrumOf,
    backgroundOf: backgroundOf,
    iconUrl: iconUrl,
    paintIcons: paintIcons,
    buttonText: buttonText,
    derive: derive,
    contrast: contrast,
    setMode: setMode,
    getMode: getMode,
    isLight: isLight,
    onChange: function (fn) { listeners.push(fn); }
  };
})(window);
