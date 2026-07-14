declare module 'jstat'{
  export const jStat:{
    studentt:{cdf:(x:number,df:number)=>number};
    centralF:{cdf:(x:number,df1:number,df2:number)=>number};
  };
}
