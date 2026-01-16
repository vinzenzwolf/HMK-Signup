import DashedButton from './DashedButton';
import { useRef } from 'react';
import parseChildrenFromExcel from '../scripts/parseChildrenFromExcel';
import type { Child } from '../types/child';
import './ExcelTool.css'

type ExcelToolProps = {
    onImport: (children: Child[]) => void;
    disabled?: boolean;
};

function ExcelTool({ onImport, disabled = false }: ExcelToolProps){


    function downloadTemplate() {
        const link = document.createElement('a');
        link.href = '/excel/athleten_vorlage.xlsx';
        link.download = 'athleten_vorlage.xlsx';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
    
    const fileInputRef = useRef<HTMLInputElement>(null);
    
    return (
        <div className="excel-tools">
                <p className="excel-description">
                    Möchtest du viele Anmeldungen auf einmal erfassen? Dann kannst du unsere Excel-Vorlage herunterladen, deine Athlet:innen offline erfassen und die Datei
                    anschließend wieder hochladen, um alle Teilnehmenden auf einmal zu importieren.
                </p>

                <div className='excel-actions'>
                    <DashedButton
                    label='Excel-Vorlage herunterladen'
                    onClick= {() => downloadTemplate()}
                    disabled={disabled}
                    />

                    <input
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        ref={fileInputRef}
                        hidden
                        disabled={disabled}
                        onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;

                        const children = await parseChildrenFromExcel(file);
                        onImport(children);
                        e.target.value = '';
                        }}
                    />

                    <DashedButton
                        label="Excel-Datei importieren"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={disabled}
                    />
                </div>

            
                
        </div>
    );
}

export default ExcelTool
