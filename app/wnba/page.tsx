'use client'

import { useState, useEffect } from "react";
import Loader from "app/components/loader";
// import { baseUrl } from 'app/sitemap';
import axios from "axios";

interface IPlayer {
    name: string,
    position: number,
    offRole: number,
    minutes: number,
    mpg: number,
    bpm: number,
    obpm: number,
    dbpm: number,
    contribution: number,
    vorp: number
}



export default function Page(){

    const [playerData, setPlayerData] = useState<IPlayer[]>([]);
    const [isLoading, setLoading] = useState(true);
    const [focus, setFocus] = useState(4);
    const [order, setOrder] = useState("DESC")
    
    const columns = "Rk,Name,Minutes,MPG,BPM,OFF,DEF,VORP".split(',');

    useEffect(() => {
        let key = columns[focus];
        switch(key){
            case 'OFF':
                key = 'OBPM';
                break;
            case 'DEF':
                key = 'DBPM'; 
                break;
        }

        axios.get(`https://zfdupont.com/api/players?sort=${key}&order=${order}`)
            .then((res) => res.data)
            .then((playerData) => {
                setPlayerData(playerData)
                setLoading(false)
            })
    }, [focus, order]);
    
    const handleClick = (col: number) => {
        if (focus === col || col === 0) {
            setOrder(order === 'ASC' ? 'DESC' : 'ASC')
        } else {
            setFocus(col);
        }
    }

    if(isLoading){
        return <Loader />
    }

    let headers = columns.map((header, index) => (
        <th key={index} 
            onClick={() => handleClick(index)}
            className={`${index === focus ? 'underline bg-slate-100/25':'hover:bg-slate-100/25'}  cursor-pointer p-4`}
            >{header}</th>
    ))

    let rows = playerData.filter(p => p.minutes > 250).map((player, index, arr) => (
        <tr key={index} className="border-b-1 hover:bg-slate-100/10 text-right">
            <td className={`${focus == 0 ? 'bg-slate-100/25':'hover:bg-slate-100/25'} text-left`} >{order === 'DESC' ? index+1 : arr.length-index+1}</td>
            <td className={`${focus == 1 ? 'bg-slate-100/25':'hover:bg-slate-100/25'} text-pretty text-left`}>{player.name}</td>
            {/* <td>{player.position}</td>
            <td>{player.offrole}</td> */}
            <td className={`${focus == 2 ? 'bg-slate-100/25':'hover:bg-slate-100/25'} text-pretty`}>{player.minutes}</td>
            <td className={`${focus == 3 ? 'bg-slate-100/25':'hover:bg-slate-100/25'} text-pretty`}>{player.mpg.toFixed(1)}</td>
            <td className={`${focus == 4 ? 'bg-slate-100/25':'hover:bg-slate-100/25'} text-pretty`}>{player.bpm.toFixed(1)}</td>
            <td className={`${focus == 5 ? 'bg-slate-100/25':'hover:bg-slate-100/25'} text-pretty`}>{player.obpm.toFixed(1)}</td>
            <td className={`${focus == 6 ? 'bg-slate-100/25':'hover:bg-slate-100/25'} text-pretty`}>{player.dbpm.toFixed(1)}</td>
            {/* <td>{player.contribution}</td> */}
            <td className={`${focus == 7 ? 'bg-slate-100/25':'hover:bg-slate-100/25'} text-pretty`}>{player.vorp.toFixed(2)}</td>
        </tr>
    ));

    return (
        <section className="min-w-full flex flex-col justify-center items-center">
            <h1 className="text-2xl mb-5">2024 WNBA Player Ranking</h1>
            <table className="table-fixed">
                <thead>
                    <tr>{headers}</tr>
                </thead>
                <tbody>{rows}</tbody>
            </table>
            
	    <a className="hover:underline" href={'https://www.basketball-reference.com/about/bpm2.html'}><p>see more about the methodology here</p></a>
        </section>
    )
}
