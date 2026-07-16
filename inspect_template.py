import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path
import argparse

def inspect_xlsx(file_path: Path, num_rows: int = 5):
    """
    Inspects an .xlsx file by unzipping it and printing the first few rows
    of each sheet from the raw XML.
    """
    if not file_path.exists():
        print(f"Error: File not found at {file_path}")
        return

    with zipfile.ZipFile(file_path) as z:
        ns = {'a': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
        shared = []
        if 'xl/sharedStrings.xml' in z.namelist():
            root = ET.fromstring(z.read('xl/sharedStrings.xml'))
            for si in root.findall('a:si', ns):
                texts = [t.text or '' for t in si.iterfind('.//a:t', ns)]
                shared.append(''.join(texts))
        print(f"Shared strings count: {len(shared)}")

        for name in sorted(z.namelist()):
            if name.startswith('xl/worksheets/sheet') and name.endswith('.xml'):
                print(f"\n--- SHEET: {name} ---")
                root = ET.fromstring(z.read(name))
                sheet_rows = root.findall('.//a:sheetData/a:row', ns)
                for row in sheet_rows[:num_rows]:
                    vals = []
                    for c in row.findall('a:c', ns):
                        t = c.attrib.get('t')
                        v_element = c.find('a:v', ns)
                        val = v_element.text if v_element is not None else ''
                        if t == 's' and val:
                            idx = int(val)
                            vals.append(shared[idx] if 0 <= idx < len(shared) else f"s_idx_{idx}_err")
                        else:
                            vals.append(val)
                    print(vals)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Inspect raw XML data from an .xlsx file.")
    parser.add_argument("file", help="Path to the .xlsx file to inspect.")
    parser.add_argument("-n", "--rows", type=int, default=5, help="Number of rows to preview from each sheet.")
    args = parser.parse_args()

    inspect_xlsx(Path(args.file), args.rows)
