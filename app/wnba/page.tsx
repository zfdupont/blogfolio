import { parse } from 'csv-parse';
import * as fs from "fs";
import * as path from "path";

type PlayerStats = {
    name: string,
    position: number,
    offRole: number,
    minutes: number,
    mpg: number,
    bpm: number,
    obpm: number,
    contribution: number,
    vorp: number
}


export default function Page(){

    const csvFilePath = path.resolve(__dirname, '../../../../rsrc/wnba_rankings.csv');

    const columns = "Name,Pos,Off. Role,Minutes,MPG,BPM,OFF,DEF,Contribution,VORP".split(',')
    const fileContent = fs.readFileSync(csvFilePath, { encoding: 'utf-8' });

    let rowData: any[][] = fileContent.split('\n').map((row) => row.split(','));

    let headers = columns.map((header, index) => (
        <th key={index}>{header}</th>
    ))
    let rows = rowData.map((row, index) => (
        <tr key={index}>
        {
        row.map((cell, cellIndex) => (
            <td key={cellIndex}>{cell}</td>
        ))}
        </tr>
    ))
    return (
        <section>
            <table className='border-separate border border-slate-900 border-tools-table-outline'>
                <thead>
                    <tr>{headers}</tr>
                </thead>
                <tbody>{rows.slice(1)}</tbody>
            </table>
            {/* {rowData} */}
        </section>
    )
}