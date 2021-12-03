#!/usr/bin/gawk -f

BEGIN{   
    #print ARGV[1]
    print inc(CurrentVArg)

    #the output is something like this
    #1:  1.2.3.4      =>  1.2.3.5
    #2:  1.2.3.44     =>  1.2.3.45
    #3:  1.2.3.99     =>  1.2.4.00
    #4:  1.2.3        =>  1.2.4
    #5:  9            =>  10
    #6:  9.9.9.9      =>  10.0.0.0
    #7:  99.99.99.99  =>  100.00.00.00
    #8:  99.0.99.99   =>  99.1.00.00
    #9:  =>           -1
}

function inc(s,    a, len1, len2, len3, head, tail)
{
    split(s, a, ".")

    len1 = length(a)
    if(len1==0)
        return -1
    else if(len1==1)
        return s+1

    len2 = length(a[len1])
    len3 = length(a[len1]+1)

    head = join(a, 1, len1-1)
    tail = sprintf("%0*d", len2, (a[len1]+1)%(10^len2))

    if(len2==len3)
        return head "." tail
    else
        return inc(head) "." tail
}

function join(a, x, y,    s)
{
    for(i=x; i<y; i++)
        s = s a[i] "."
    return s a[y]
}
