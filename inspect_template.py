import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

path = Path(r'C:\Users\Josh\Documents\assignments\decision-support-system\Vellum_Standard_Upload_Template (2).xlsx')
with zipfile.ZipFile(path) as z:
    ns = {'a':'http://schemas.openxmlformats.org/spreadsheetml/2006/main', 'r':'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}
    shared = []
    if 'xl/sharedStrings.xml' in z.namelist():
        root = ET.fromstring(z.read('xl/sharedStrings.xml'))
        for si in root.findall('a:si', ns):
            texts = []
            for t in si.iterfind('.//a:t', ns):
                texts.append(t.text or '')
            shared.append(''.join(texts))
    print('shared strings count', len(shared))
    for name in z.namelist():
        if name.startswith('xl/worksheets/sheet') and name.endswith('.xml'):
            print('SHEET', name)
            root = ET.fromstring(z.read(name))
            rows = root.findall('.//a:sheetData/a:row', ns)
            for row in rows[:5]:
                vals = []
                for c in row.findall('a:c', ns):
                    t = c.attrib.get('t')
                    v = c.find('a:v', ns)
                    if v is None:
                        vals.append('')
                    else:
                        text = v.text
                        if t == 's' and text is not None:
                            idx = int(text)
                            vals.append(shared[idx] if 0 <= idx < len(shared) else '')
                        else:
                            vals.append(text)
                print(vals)
            print('---')
